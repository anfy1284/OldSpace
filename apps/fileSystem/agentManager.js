const WebSocket = require('ws');
const EventEmitter = require('events');
const global = require('../../drive_root/globalServerContext');

class ConnectionManager {
    constructor() {
        this.activeConnections = new Map(); // agent_id -> ws
    }

    async connect(agentId, ws) {
        this.activeConnections.set(agentId, ws);
        // Update status in DB
        try {
            const AgentModel = global.modelsDB.FileSystem_Agents;
            if (AgentModel) {
                await AgentModel.update({ status: true, lastSeen: new Date() }, { where: { id: agentId } });
            }
        } catch (e) {
            console.error('Error updating agent status:', e);
        }
    }

    async disconnect(agentId) {
        this.activeConnections.delete(agentId);
        // Update status in DB
        try {
            const AgentModel = global.modelsDB.FileSystem_Agents;
            if (AgentModel) {
                await AgentModel.update({ status: false, lastSeen: new Date() }, { where: { id: agentId } });
            }
        } catch (e) {
            console.error('Error updating agent status:', e);
        }
    }

    get(agentId) {
        return this.activeConnections.get(agentId);
    }
}

class AgentManager extends EventEmitter {
    constructor() {
        super();
        this.connectionManager = new ConnectionManager();
        this.pendingRequests = new Map(); // request_id -> { resolve, reject, timeout }
    }

    setupWebSocket(server) {
        this.wss = new WebSocket.Server({ noServer: true });

        server.on('upgrade', (request, socket, head) => {
            const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

            if (pathname === '/ws') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            }
        });

        this.wss.on('connection', (ws) => {
            console.log('New WebSocket connection');
            let authenticated = false;
            let agentId = null;

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);

                    if (!authenticated) {
                        if (data.action === 'auth') {
                            const { token, agent_id } = data;
                            // Verify token
                            const AgentModel = global.modelsDB.FileSystem_Agents;
                            const agent = await AgentModel.findOne({ where: { id: agent_id } });

                            if (agent && agent.token === token) {
                                authenticated = true;
                                agentId = agent_id;
                                await this.connectionManager.connect(agentId, ws);
                                ws.send(JSON.stringify({ status: 'ok' }));
                                console.log(`Agent ${agentId} authenticated`);
                            } else {
                                ws.send(JSON.stringify({ status: 'error', message: 'Invalid token or agent_id' }));
                                ws.close();
                            }
                        } else {
                            ws.close();
                        }
                        return;
                    }

                    // Handle responses
                    if (data.action === 'response') {
                        const { request_id, status, data: responseData, message: errorMsg } = data;
                        if (this.pendingRequests.has(request_id)) {
                            const { resolve, reject, timeout } = this.pendingRequests.get(request_id);
                            clearTimeout(timeout);
                            this.pendingRequests.delete(request_id);

                            if (status === 'success') {
                                resolve(responseData);
                            } else {
                                reject(new Error(errorMsg || 'Agent returned error'));
                            }
                        }
                    }

                } catch (e) {
                    console.error('Error handling message:', e);
                }
            });

            ws.on('close', async () => {
                if (agentId) {
                    console.log(`Agent ${agentId} disconnected`);
                    await this.connectionManager.disconnect(agentId);
                }
            });
        });
    }

    async sendCommand(agentId, command, timeoutMs = 30000) {
        const ws = this.connectionManager.get(agentId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('Agent offline');
        }

        return new Promise((resolve, reject) => {
            const requestId = command.request_id;
            
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('Timeout waiting for agent response'));
                }
            }, timeoutMs);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            ws.send(JSON.stringify(command));
        });
    }
}

module.exports = new AgentManager();
