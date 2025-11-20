
//TEST

// Первая тестовая форма (верхний левый угол)
const form1 = new Form();
form1.setTitle('Тестовая форма 1');
form1.setX(30);
form1.setY(30);
form1.setWidth(200);
form1.setHeight(120);
form1.setZ(1);
form1.onDraw(document.body);

// Вторая тестовая форма (правый нижний угол)
const form2 = new Form();
form2.setTitle('Окно настроек');
form2.setX(700);
form2.setY(700);
form2.setWidth(260);
form2.setHeight(160);
form2.setZ(2);
form2.movable = false;
form2.setAnchorToWindow('bottom-right');
form2.onDraw(document.body);


// Третья форма (по центру экрана)
const formCalc = new Form();
formCalc.setTitle('Калькулятор');
formCalc.setX(300);
formCalc.setY(300);
formCalc.setWidth(500);
formCalc.setHeight(300);
formCalc.setZ(3);
formCalc.setAnchorToWindow('center');
formCalc.displayMemory = '0';
formCalc.dotPressed = false;
formCalc.operationGiven = false;
formCalc.operation = null;
formCalc.value1 = '';
formCalc.value2 = '';
formCalc.isError = false;

formCalc.onDraw = function(parent) {
	// Вызываем базовую реализацию
	Form.prototype.onDraw.call(this, parent);
	
	// Создаем невидимую таблицу 5x4 (добавили строку для TextBox)
	const table = document.createElement('table');
	this.getContentArea().appendChild(table);
	table.style.width = '100%';
	table.style.height = '100%';
	table.style.borderCollapse = 'collapse';
	table.style.tableLayout = 'fixed';

	// Первая строка с TextBox (объединенные колонки)
	const displayRow = document.createElement('tr');
	const displayCell = document.createElement('td');
	displayCell.colSpan = 4;
	displayCell.style.padding = '4px';
	displayCell.style.margin = '0';
	displayRow.appendChild(displayCell);
	table.appendChild(displayRow);

	// Создаем TextBox для отображения результата
	const displayTextBox = new TextBox(displayCell);
	displayTextBox.setParent(formCalc)
	displayTextBox.setReadOnly(true);
	formCalc.refreshDisplay = function() {
		if (formCalc.isError){
			displayTextBox.setText('Error');
			return;
		}
		displayTextBox.setText(formCalc.displayMemory);
	}
	displayTextBox.setText('0');
	displayTextBox.onDraw(displayCell);
	
	const textBoxElement = displayTextBox.getElement();
	if (textBoxElement) {
		textBoxElement.style.width = '100%';
		textBoxElement.style.height = '40px';
		textBoxElement.style.fontSize = '24px';
		textBoxElement.style.textAlign = 'right';
		
		// Устанавливаем высоту строки на основе высоты TextBox
		const textBoxHeight = textBoxElement.offsetHeight;
		const cellPadding = parseInt(displayCell.style.padding) * 2;
		const rowHeight = textBoxHeight + cellPadding;
		displayRow.style.height = rowHeight + 'px';
		displayCell.style.height = rowHeight + 'px';
	}

	// Создаем кнопки калькулятора
	const buttons = [
			[{caption: '%', digit:null, operation:'%'}, {caption: 'CE', digit:null, operation:'CE'}, {caption: 'C', digit:null, operation:'C'}, {caption: '⌫', digit:null, operation:'backspace'}],
			[{caption: '7', digit:'7', operation:null}, {caption: '8', digit:'8', operation:null}, {caption: '9', digit:'9', operation:null}, {caption: '/', digit:null, operation:'/'}],
			[{caption: '4', digit:'4', operation:null}, {caption: '5', digit:'5', operation:null}, {caption: '6', digit:'6', operation:null}, {caption: '*', digit:null, operation:'*'}],
			[{caption: '1', digit:'1', operation:null}, {caption: '2', digit:'2', operation:null}, {caption: '3', digit:'3', operation:null}, {caption: '-', digit:null, operation:'-'}],
			[{caption: '0', digit:'0', operation:null}, {caption: '.', digit:null, operation:'.'}, {caption: '=', digit:null, operation:'='}, {caption: '+', digit:null, operation:'+'}]
		];

	let cellIndex = 0;

	for (let i = 0; i < buttons.length; i++) {
			const row = document.createElement('tr');
			for (let j = 0; j < buttons[i].length; j++) {
				
				const cell = document.createElement('td');
				cell.style.padding = '0';
				cell.style.margin = '0';
				row.appendChild(cell);

				const btn = new Button(cell);
				btn.setCaption(buttons[i][j].caption);
				btn.setParent(cell);
				btn.onDraw(cell);
				btn.onClick = function() {
					// Обработка нажатия кнопки
					if(buttons[i][j].digit){
						if (formCalc.isError){
							formCalc.isError = false;
						}
						if (formCalc.operationGiven){
							formCalc.displayMemory = '';
							formCalc.operationGiven = false;
						}
						if (formCalc.displayMemory === '0'){
							formCalc.displayMemory = '';
						}
						formCalc.displayMemory = formCalc.displayMemory + buttons[i][j].digit;
					}else{
						if(buttons[i][j].operation === '.' && !formCalc.dotPressed){
							formCalc.displayMemory = formCalc.displayMemory + '.';
							formCalc.dotPressed = true;
						} else if (buttons[i][j].operation === 'C'){
							formCalc.isError = false;
							formCalc.displayMemory = '0';
							formCalc.operation = null;
							formCalc.value1 = '0';
							formCalc.value2 = '0';
							formCalc.dotPressed = false;
							formCalc.operationGiven = false;
						} else if (buttons[i][j].operation === 'CE'){
							formCalc.isError = false;
							formCalc.value1 = '0';
							formCalc.displayMemory = '0';
							formCalc.dotPressed = false;
						} else if (buttons[i][j].operation === 'backspace'){
							if (formCalc.displayMemory.length > 1){
								if (formCalc.displayMemory.slice(-1) === '.'){
									formCalc.dotPressed = false;
								}
								formCalc.displayMemory = formCalc.displayMemory.slice(0, -1);
							} else {
								formCalc.displayMemory = '0';
							}
						} else if (['+', '-', '*', '/'].includes(buttons[i][j].operation)){
							formCalc.operation = buttons[i][j].operation;
							formCalc.operationGiven = true;
							formCalc.value1 = formCalc.displayMemory;
							formCalc.value2 = '';
						} else if (buttons[i][j].operation === '%'){
							formCalc.displayMemory = (parseFloat(formCalc.displayMemory) / 100 * parseFloat(formCalc.value1)).toString();
						} else if (buttons[i][j].operation === '='){
							if (formCalc.operation && formCalc.value1 !== ''){
								if(formCalc.value2 === ''){
									formCalc.value2 = formCalc.displayMemory;
								}
								switch(formCalc.operation){
									case '+':
										formCalc.displayMemory = (parseFloat(formCalc.value1) + parseFloat(formCalc.value2)).toString();
										break;
									case '-':
										formCalc.displayMemory = (parseFloat(formCalc.value1) - parseFloat(formCalc.value2)).toString();
										break;
									case '*':
										formCalc.displayMemory = (parseFloat(formCalc.value1) * parseFloat(formCalc.value2)).toString();
										break;
									case '/':
										if (parseFloat(formCalc.displayMemory) !== 0){
											formCalc.displayMemory = (parseFloat(formCalc.value1) / parseFloat(formCalc.value2)).toString();
										} else {
											formCalc.displayMemory = '';
											formCalc.isError = true;
											formCalc.operationGiven = true;
										}
										break;
									case '%':
										formCalc.displayMemory = (parseFloat(formCalc.value1) % parseFloat(formCalc.value2)).toString();
										break;
								}
								formCalc.value1 = formCalc.displayMemory;
							}
						}
					}
					formCalc.refreshDisplay();
				}
				
				// Получаем элемент кнопки и настраиваем его размеры
				const btnElement = btn.getElement();
				if (btnElement) {
					btnElement.style.width = '100%';
					btnElement.style.height = '100%';
					btnElement.style.fontSize = '18px';
				}
				cellIndex++;
			}
			table.appendChild(row);
		}

};
formCalc.onDraw(document.body);

//TETRIS

// Третья форма (по центру экрана)
const formTetris = new Form();
formTetris.setTitle('Tetris');
formTetris.setX(600);
formTetris.setY(600);
formTetris.setWidth(500);
formTetris.setHeight(300);
formTetris.setZ(4);
formTetris.setAnchorToWindow('center');

// Свойства и методы, специфичные для игры Тетрис
formTetris.gridWidth = 10;
formTetris.gridHeight = 20;
formTetris.grid = [];
formTetris.playArea = null;
formTetris.cellSize = 0;
formTetris.currentFigure = null;
formTetris.currentFigurePosition = {x: 0, y: 0};
formTetris.currentFigureRotation = 0;
formTetris.score = 0;
formTetris.level = 1;
formTetris.linesCleared = 0;
formTetris.gameInterval = null;
formTetris.speedInterval = 0;
formTetris.isGameOver = false;
formTetris.nextFigure = null;
formTetris.currentFigureElements = null;
formTetris.currentFigureAdresses = null;
formTetris.contentArea = null;

formTetris.checkCollision = function(cellX, cellY) {
	if (cellX < 0 || cellX >= this.gridWidth || cellY < 0 || cellY >= this.gridHeigh || this.grid[cellY][cellX].value !== 0) {
		return true;
	}
}

formTetris.setNewFigure = function(newFigure) {
	const currentFigureShape = newFigure.shape[0];
	this.currentFigureAdresses = [];

	for (let i = 0; i < currentFigureShape.length; i++) {
		const cellX = this.currentFigurePosition.x + currentFigureShape[i][0];
		const cellY = this.currentFigurePosition.y + currentFigureShape[i][1];
		if (this.checkCollision(cellX, cellY)){
			return false;
		}
		this.currentFigureAdresses.push({x: cellX, y: cellY});
	}
	return false;
}

formTetris.showFigure = function(isNew = false) {
	
	if (isNew) {
		this.currentFigureElements = [];
	}
	for (let i = 0; i < this.currentFigureAdresses.length; i++) {
		const cellX = this.currentFigureAdresses[i].x;
		const cellY = this.currentFigureAdresses[i].y;
		const cell = this.grid[cellY][cellX];
		if (isNew) {
			const cellDiv = document.createElement('div');
			cellDiv.style.position = 'absolute';
			cellDiv.style.width = this.cellSize + 'px';
			cellDiv.style.height = this.cellSize + 'px';
			cellDiv.style.left = cell.left + 'px';
			cellDiv.style.top = cell.top + 'px';
			cellDiv.style.backgroundColor = this.currentFigure.color;
			this.playArea.appendChild(cellDiv);
			this.currentFigureElements.push(cellDiv);
		} else {
			const cellDiv = this.currentFigureElements[i];
			cellDiv.style.left = cell.left + 'px';
			cellDiv.style.top = cell.top + 'px';
		}
	}
}

formTetris.reDraw = function() {
	// Вычисляем размеры ячеек
	const cellWidth = this.contentArea.clientHeight / this.gridHeight;
}

formTetris.initializeGrid = function() {
	this.grid = [];
	let top = this.playArea.top;
	let left = this.playArea.left;
	for (let y = 0; y < this.gridHeight; y++) {
		const row = [];
		for (let x = 0; x < this.gridWidth; x++) {
			row.push({value: 0, left: left, top: top});
			left += this.cellSize;
		}
		this.grid.push(row);
		top += this.cellSize;
	}
}

formTetris.onDraw = function(parent) {

	// Вызываем базовую реализацию
	Form.prototype.onDraw.call(this, parent);

	const contentArea = this.getContentArea();
	if (!contentArea) return;
	// Создаем игровое поле
	this.playArea = document.createElement('div');
	this.contentArea.appendChild(this.playArea);
	this.playArea.style.position = 'relative';
	this.playArea.style.margin = '0 auto';
	this.playArea.style.backgroundColor = '#f0f0f0';
	this.playArea.style.border = '1px solid #000';

	//Создаем кнопки управления
	const controlsDiv = document.createElement('div');
	this.contentArea.appendChild(controlsDiv);
	controlsDiv.style.textAlign = 'center';
	controlsDiv.style.marginTop = '10px';
	
	const startButton = new Button(controlsDiv);
	startButton.setCaption('New Game');
	startButton.setParent(controlsDiv);
	startButton.onDraw(controlsDiv);
	startButton.onClick = () => {
		this.newGame();
	};

	const pauseButton = document.createElement('button');
	pauseButton.textContent = 'Pause';
	controlsDiv.appendChild(pauseButton);
	pauseButton.onclick = () => {
		if (this.gameInterval){
			clearInterval(this.gameInterval);
			this.gameInterval = null;
		} else {
			// Запуск игрового цикла
			this.gameInterval = setInterval(() => {
				this.gameStep();
			}, this.speedInterval);
		}
	};

	this.reDraw();
	this.initializeGrid();
}

formTetris.figures = [
	// I
	{shape: [
		[[1, 1], [2, 1], [3, 1], [4, 1]], 
		[[1, 1], [1, 2], [1, 3], [1, 4]]], 
		color: 'cyan'},
	// J
	{shape: [
		[[1, 1], [1, 2], [2, 2], [3, 2]], 
		[[2, 1], [3, 1], [2, 2], [2, 3]], 
		[[1, 2], [2, 2], [3, 2], [3, 3]], 
		[[2, 1], [2, 2], [1, 3], [2, 3]]], 
		color: 'blue'},
	// L
	{shape: [
		[[3, 1], [1, 2], [2, 2], [3, 2]],
		[[2, 1], [2, 2], [2, 3], [3, 3]],
		[[1, 2], [2, 2], [3, 2], [1, 3]],
		[[1, 1], [2, 1], [2, 2], [2, 3]]],
		color: 'orange'},
	// O
	{shape: [
		[[1, 1], [2, 1], [1, 2], [2, 2]]],
		color: 'yellow'},
	// S
	{shape: [
		[[2, 1], [3, 1], [1, 2], [2, 2]],
		[[2, 1], [2, 2], [3, 2], [3, 3]]],
		color: 'green'},
	// T
	{shape: [
		[[2, 1], [1, 2], [2, 2], [3, 2]],
		[[2, 1], [2, 2], [3, 2], [2, 3]],
		[[1, 2], [2, 2], [3, 2], [2, 3]],
		[[2, 1], [1, 2], [2, 2], [2, 3]]],
		color: 'purple'},
	// Z
	{shape: [
		[[1, 1], [2, 1], [2, 2], [3, 2]],
		[[3, 1], [2, 2], [3, 2], [2, 3]]],
		color: 'red'}	
]

formTetris.getRandomFigure = function() {
	const index = Math.floor(Math.random() * this.figures.length);
	return this.figures[index];
}

formTetris.getFigureStartPosition = function(figure) {
	const shape = figure.shape[0];
	const minX = Math.min(...shape.map(coord => coord[0]));
	const maxX = Math.max(...shape.map(coord => coord[0]));
	const startX = Math.floor((this.gridWidth - (maxX - minX + 1)) / 2) - minX + 1;
	return {x: startX, y: 0};
}

formTetris.startNewLevel = function(level){
	this.level = level;
	this.speedInterval = 1000 - (level - 1) * 100;
	if (this.speedInterval < 100) {
		this.speedInterval = 100;
	}
	if (this.gameInterval){
		clearInterval(this.gameInterval);
	}

	if (this.setNewFigure(this.currentFigure)){
		this.showFigure(true);
		// Запуск игрового цикла
		this.gameInterval = setInterval(() => {
			this.gameStep();
		}, this.speedInterval);
	}else{
		this.setGameOver();
	}

	
}

formTetris.setGameOver = function() {
	this.isGameOver = true;
}

formTetris.moveFigureDown = function() {
	const newAddresses = [];
	let isCollision = false;
	this.currentFigureAdresses.forEach(elem => {
		let newAdress = {x: elem.x, y: elem.y + 1};
		if (this.checkCollision(newAdress.x, newAdress.y)){
			isCollision = true;
		}
		newAddresses.push(newAdress);
	});
	if (isCollision){
		this.nextFigure();
	} else {
		this.currentFigureAdresses = newAddresses;
		this.showFigure(false);
	}
}

formTetris.gameStep = function() {
	this.moveFigureDown();
}

formTetris.newGame = function() {
	this.initializeGrid();
	this.currentFigure = this.getRandomFigure();
	this.nextFigure = this.getRandomFigure();
	this.currentFigurePosition = this.getFigureStartPosition(this.currentFigure);
	this.currentFigureRotation = 0;
	this.score = 0;
	this.level = 1;
	this.linesCleared = 0;
	this.isGameOver = false;
	this.startNewLevel(this.level);
}

formTetris.onDraw(document.body);
//TETRIS