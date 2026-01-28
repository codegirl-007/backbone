// Set up global $ as alias to Backbone.$
window.$ = Backbone.$;

// Setup QUnit DOM fixtures
var body = document.body;
var qunitDiv = document.createElement('div');
qunitDiv.id = 'qunit';
body.appendChild(qunitDiv);

var fixtureDiv = document.createElement('div');
fixtureDiv.id = 'qunit-fixture';
body.appendChild(fixtureDiv);
