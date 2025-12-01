const formMessenger = new Form();
formMessenger.setTitle('Messenger');

// Занять 1/3 ширины экрана, 100% высоты, у правого края
const screenWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
const formWidth = Math.round(screenWidth / 2);
formMessenger.setWidth(formWidth);
formMessenger.setHeight(screenHeight);
formMessenger.setX(screenWidth - formWidth);
formMessenger.setY(0);
formMessenger.displayMemory = '0';
formMessenger.dotPressed = false;
formMessenger.operationGiven = false;
formMessenger.operation = null;
formMessenger.value1 = '';
formMessenger.value2 = '';
formMessenger.isError = false;

formMessenger.onDraw = function(parent) {
	// Вызываем базовую реализацию
	Form.prototype.onDraw.call(this, parent);
	
	// Создаём таблицу с видимыми границами для отладки
	const table = document.createElement('table');
	this.getContentArea().appendChild(table);
	table.style.width = '100%';
	table.style.height = '100%';
	table.style.borderCollapse = 'collapse';
	table.style.tableLayout = 'fixed';
	table.style.border = '1px solid black';

	// Одна строка, два столбца (левый 1/4, правый 3/4)
	const row = document.createElement('tr');
	table.appendChild(row);


	// Левый столбец (1/4 ширины)
	const leftCell = document.createElement('td');
	leftCell.style.width = '25%';
	leftCell.style.border = '1px solid black';
	leftCell.style.verticalAlign = 'top';
	row.appendChild(leftCell);

	// Вложенная таблица в левом столбце (2 строки)
	const leftTable = document.createElement('table');
	leftTable.style.width = '100%';
	leftTable.style.height = '100%';
	leftTable.style.borderCollapse = 'collapse';
	leftTable.style.tableLayout = 'fixed';
	leftTable.style.border = '1px solid black';
	leftCell.appendChild(leftTable);

	// Верхняя ячейка (30px) — Label 'Chats'
	const leftRowTop = document.createElement('tr');
	leftTable.appendChild(leftRowTop);
	const leftCellTop = document.createElement('td');
	leftCellTop.style.border = '1px solid black';
	leftCellTop.style.height = '30px';
	leftRowTop.appendChild(leftCellTop);

	// Label 'Chats' (используем UI_classes.js)
	const chatsLabel = new Label(leftCellTop);
	chatsLabel.setText('Chats');
	chatsLabel.setParent(leftCellTop);
	chatsLabel.onDraw(leftCellTop);
	chatsLabel.setFontSize('18px');
	chatsLabel.setFontWeight('bold');
	chatsLabel.onDraw(leftCellTop);

	// Нижняя ячейка (всё остальное)
	const leftRowBottom = document.createElement('tr');
	leftTable.appendChild(leftRowBottom);
	const leftCellBottom = document.createElement('td');
	leftCellBottom.style.border = '1px solid black';
	leftRowBottom.appendChild(leftCellBottom);

	// Правый столбец (3/4 ширины)
	const rightCell = document.createElement('td');
	rightCell.style.width = '75%';
	rightCell.style.border = '1px solid black';
	rightCell.style.verticalAlign = 'top';
	row.appendChild(rightCell);

	// Вложенная таблица в правом столбце
	const rightTable = document.createElement('table');
	rightTable.style.width = '100%';
	rightTable.style.height = '100%';
	rightTable.style.borderCollapse = 'collapse';
	rightTable.style.tableLayout = 'fixed';
	rightTable.style.border = '1px solid black';
	rightCell.appendChild(rightTable);

	// Верхняя ячейка (всё кроме 30px)
	const rightRowTop = document.createElement('tr');
	rightTable.appendChild(rightRowTop);
	const rightCellTop = document.createElement('td');
	rightCellTop.style.border = '1px solid black';
	rightCellTop.style.height = 'calc(100% - 30px)';
	rightRowTop.appendChild(rightCellTop);

	// Нижняя ячейка (30px)
	const rightRowBottom = document.createElement('tr');
	rightTable.appendChild(rightRowBottom);
	const rightCellBottom = document.createElement('td');
	rightCellBottom.style.border = '1px solid black';
	rightCellBottom.style.height = '30px';
	rightRowBottom.appendChild(rightCellBottom);

	// Для отладки: заливка цветом
	// rightCellTop.style.background = '#eef';
	// rightCellBottom.style.background = '#fee';
	// leftCell.style.background = '#efe';

	callServerMethod('messenger', 'onLoad', {})
		.then(result => {
			//location.reload();
		})
		.catch(err => {
			console.error('Ошибка: ' + err.message);
		});

};
formMessenger.onDraw(document.body);