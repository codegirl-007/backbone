(function(QUnit) {

  var view;

  // Helper function to trigger events natively
  function triggerEvent(el, eventName) {
    var event = new Event(eventName, {bubbles: true, cancelable: true});
    el.dispatchEvent(event);
  }

  // Helper to create element from HTML string
  function createElement(html) {
    var temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.firstChild;
  }

  QUnit.module('Backbone.View', {

    beforeEach: function() {
      var fixture = document.getElementById('qunit-fixture');
      var testEl = createElement('<div id="testElement"><h1>Test</h1></div>');
      fixture.appendChild(testEl);

      view = new Backbone.View({
        id: 'test-view',
        className: 'test-view',
        other: 'non-special-option'
      });
    },

    afterEach: function() {
      var testEl = document.getElementById('testElement');
      if (testEl && testEl.parentNode) testEl.parentNode.removeChild(testEl);
      var viewEl = document.getElementById('test-view');
      if (viewEl && viewEl.parentNode) viewEl.parentNode.removeChild(viewEl);
    }

  });

  QUnit.test('constructor', function(assert) {
    assert.expect(3);
    assert.equal(view.el.id, 'test-view');
    assert.equal(view.el.className, 'test-view');
    assert.equal(view.el.other, void 0);
  });

  QUnit.test('$', function(assert) {
    assert.expect(2);
    var myView = new Backbone.View;
    myView.setElement('<p><a><b>test</b></a></p>');
    var result = myView.$('a b');

    assert.strictEqual(result[0].innerHTML, 'test');
    assert.ok(result.length === +result.length);
  });

  QUnit.test('el is a DOM element', function(assert) {
    assert.expect(2);
    var myView = new Backbone.View;
    myView.setElement('<p><a><b>test</b></a></p>');
    assert.strictEqual(myView.el.nodeType, 1);
    assert.strictEqual(myView.el.tagName, 'P');
  });

  QUnit.test('initialize', function(assert) {
    assert.expect(1);
    var View = Backbone.View.extend({
      initialize: function() {
        this.one = 1;
      }
    });

    assert.strictEqual(new View().one, 1);
  });

  QUnit.test('preinitialize', function(assert) {
    assert.expect(1);
    var View = Backbone.View.extend({
      preinitialize: function() {
        this.one = 1;
      }
    });

    assert.strictEqual(new View().one, 1);
  });

  QUnit.test('preinitialize occurs before the view is set up', function(assert) {
    assert.expect(2);
    var View = Backbone.View.extend({
      preinitialize: function() {
        assert.equal(this.el, undefined);
      }
    });
    var _view = new View({});
    assert.notEqual(_view.el, undefined);
  });

  QUnit.test('render', function(assert) {
    assert.expect(1);
    var myView = new Backbone.View;
    assert.equal(myView.render(), myView, '#render returns the view instance');
  });

  QUnit.test('delegateEvents', function(assert) {
    assert.expect(6);
    var counter1 = 0, counter2 = 0;

    var myView = new Backbone.View({el: '#testElement'});
    myView.increment = function() { counter1++; };
    myView.el.addEventListener('click', function() { counter2++; });

    var events = {'click h1': 'increment'};

    myView.delegateEvents(events);
    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter1, 1);
    assert.equal(counter2, 1);

    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter1, 2);
    assert.equal(counter2, 2);

    myView.delegateEvents(events);
    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter1, 3);
    assert.equal(counter2, 3);
  });

  QUnit.test('delegate', function(assert) {
    assert.expect(3);
    var myView = new Backbone.View({el: '#testElement'});
    myView.delegate('click', 'h1', function() {
      assert.ok(true);
    });
    myView.delegate('click', function() {
      assert.ok(true);
    });
    triggerEvent(myView.$('h1')[0], 'click');

    assert.equal(myView.delegate(), myView, '#delegate returns the view instance');
  });

  QUnit.test('delegateEvents allows functions for callbacks', function(assert) {
    assert.expect(3);
    var myView = new Backbone.View({el: '<p></p>'});
    myView.counter = 0;

    var events = {
      click: function() {
        this.counter++;
      }
    };

    myView.delegateEvents(events);
    triggerEvent(myView.el, 'click');
    assert.equal(myView.counter, 1);

    triggerEvent(myView.el, 'click');
    assert.equal(myView.counter, 2);

    myView.delegateEvents(events);
    triggerEvent(myView.el, 'click');
    assert.equal(myView.counter, 3);
  });

  QUnit.test('delegateEvents ignore undefined methods', function(assert) {
    assert.expect(0);
    var myView = new Backbone.View({el: '<p></p>'});
    myView.delegateEvents({click: 'undefinedMethod'});
    triggerEvent(myView.el, 'click');
  });

  QUnit.test('undelegateEvents', function(assert) {
    assert.expect(7);
    var counter1 = 0, counter2 = 0;

    var myView = new Backbone.View({el: '#testElement'});
    myView.increment = function() { counter1++; };
    myView.el.addEventListener('click', function() { counter2++; });

    var events = {'click h1': 'increment'};

    myView.delegateEvents(events);
    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter1, 1);
    assert.equal(counter2, 1);

    myView.undelegateEvents();
    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter1, 1);
    assert.equal(counter2, 2);

    myView.delegateEvents(events);
    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter1, 2);
    assert.equal(counter2, 3);

    assert.equal(myView.undelegateEvents(), myView, '#undelegateEvents returns the view instance');
  });

  QUnit.test('undelegate', function(assert) {
    assert.expect(1);
    var myView = new Backbone.View({el: '#testElement'});
    myView.delegate('click', function() { assert.ok(false); });
    myView.delegate('click', 'h1', function() { assert.ok(false); });

    myView.undelegate('click');

    triggerEvent(myView.$('h1')[0], 'click');
    triggerEvent(myView.el, 'click');

    assert.equal(myView.undelegate(), myView, '#undelegate returns the view instance');
  });

  QUnit.test('undelegate with passed handler', function(assert) {
    assert.expect(1);
    var myView = new Backbone.View({el: '#testElement'});
    var listener = function() { assert.ok(false); };
    myView.delegate('click', listener);
    myView.delegate('click', function() { assert.ok(true); });
    myView.undelegate('click', null, listener);
    triggerEvent(myView.el, 'click');
  });

  QUnit.test('undelegate with selector', function(assert) {
    assert.expect(2);
    var myView = new Backbone.View({el: '#testElement'});
    myView.delegate('click', function() { assert.ok(true); });
    myView.delegate('click', 'h1', function() { assert.ok(false); });
    myView.undelegate('click', 'h1');
    triggerEvent(myView.$('h1')[0], 'click');
    triggerEvent(myView.el, 'click');
  });

  QUnit.test('undelegate with handler and selector', function(assert) {
    assert.expect(2);
    var myView = new Backbone.View({el: '#testElement'});
    myView.delegate('click', function() { assert.ok(true); });
    var handler = function() { assert.ok(false); };
    myView.delegate('click', 'h1', handler);
    myView.undelegate('click', 'h1', handler);
    triggerEvent(myView.$('h1')[0], 'click');
    triggerEvent(myView.el, 'click');
  });

  QUnit.test('tagName can be provided as a string', function(assert) {
    assert.expect(1);
    var View = Backbone.View.extend({
      tagName: 'span'
    });

    assert.equal(new View().el.tagName, 'SPAN');
  });

  QUnit.test('tagName can be provided as a function', function(assert) {
    assert.expect(1);
    var View = Backbone.View.extend({
      tagName: function() {
        return 'p';
      }
    });

    assert.equal(new View().el.tagName, 'P');
  });

  QUnit.test('_ensureElement with DOM node el', function(assert) {
    assert.expect(1);
    var View = Backbone.View.extend({
      el: document.body
    });

    assert.equal(new View().el, document.body);
  });

  QUnit.test('_ensureElement with string el', function(assert) {
    assert.expect(3);
    var View = Backbone.View.extend({
      el: 'body'
    });
    assert.strictEqual(new View().el, document.body);

    View = Backbone.View.extend({
      el: '#testElement > h1'
    });
    assert.strictEqual(new View().el, document.querySelector('#testElement > h1'));

    View = Backbone.View.extend({
      el: '#nonexistent'
    });
    assert.ok(!new View().el);
  });

  QUnit.test('with className and id functions', function(assert) {
    assert.expect(2);
    var View = Backbone.View.extend({
      className: function() {
        return 'className';
      },
      id: function() {
        return 'id';
      }
    });

    assert.strictEqual(new View().el.className, 'className');
    assert.strictEqual(new View().el.id, 'id');
  });

  QUnit.test('with attributes', function(assert) {
    assert.expect(2);
    var View = Backbone.View.extend({
      attributes: {
        'id': 'id',
        'class': 'class'
      }
    });

    assert.strictEqual(new View().el.className, 'class');
    assert.strictEqual(new View().el.id, 'id');
  });

  QUnit.test('with attributes as a function', function(assert) {
    assert.expect(1);
    var View = Backbone.View.extend({
      attributes: function() {
        return {'class': 'dynamic'};
      }
    });

    assert.strictEqual(new View().el.className, 'dynamic');
  });

  QUnit.test('should default to className/id properties', function(assert) {
    assert.expect(4);
    var View = Backbone.View.extend({
      className: 'backboneClass',
      id: 'backboneId',
      attributes: {
        'class': 'attributeClass',
        'id': 'attributeId'
      }
    });

    var myView = new View;
    assert.strictEqual(myView.el.className, 'backboneClass');
    assert.strictEqual(myView.el.id, 'backboneId');
    assert.strictEqual(myView.el.getAttribute('class'), 'backboneClass');
    assert.strictEqual(myView.el.getAttribute('id'), 'backboneId');
  });

  QUnit.test('multiple views per element', function(assert) {
    assert.expect(3);
    var count = 0;
    var el = createElement('<p></p>');

    var View = Backbone.View.extend({
      el: el,
      events: {
        click: function() {
          count++;
        }
      }
    });

    var view1 = new View;
    triggerEvent(el, 'click');
    assert.equal(1, count);

    var view2 = new View;
    triggerEvent(el, 'click');
    assert.equal(3, count);

    view1.delegateEvents();
    triggerEvent(el, 'click');
    assert.equal(5, count);
  });

  QUnit.test('custom events', function(assert) {
    assert.expect(2);
    var View = Backbone.View.extend({
      el: document.body,
      events: {
        fake$event: function() { assert.ok(true); }
      }
    });

    var myView = new View;
    triggerEvent(document.body, 'fake$event');
    triggerEvent(document.body, 'fake$event');

    myView.undelegateEvents();
    triggerEvent(document.body, 'fake$event');
  });

  QUnit.test('#1048 - setElement uses provided object.', function(assert) {
    assert.expect(2);
    var el = document.body;

    var myView = new Backbone.View({el: el});
    assert.ok(myView.el === el);

    myView.setElement(el);
    assert.ok(myView.el === el);
  });

  QUnit.test('#986 - Undelegate before changing element.', function(assert) {
    assert.expect(1);
    var button1 = createElement('<button></button>');
    var button2 = createElement('<button></button>');

    var View = Backbone.View.extend({
      events: {
        click: function(e) {
          assert.ok(myView.el === e.target);
        }
      }
    });

    var myView = new View({el: button1});
    myView.setElement(button2);

    triggerEvent(button1, 'click');
    triggerEvent(button2, 'click');
  });

  QUnit.test('#1172 - Clone attributes object', function(assert) {
    assert.expect(2);
    var View = Backbone.View.extend({
      attributes: {foo: 'bar'}
    });

    var view1 = new View({id: 'foo'});
    assert.strictEqual(view1.el.id, 'foo');

    var view2 = new View();
    assert.ok(!view2.el.id);
  });

  QUnit.test('views stopListening', function(assert) {
    assert.expect(0);
    var View = Backbone.View.extend({
      initialize: function() {
        this.listenTo(this.model, 'all x', function() { assert.ok(false); });
        this.listenTo(this.collection, 'all x', function() { assert.ok(false); });
      }
    });

    var myView = new View({
      model: new Backbone.Model,
      collection: new Backbone.Collection
    });

    myView.stopListening();
    myView.model.trigger('x');
    myView.collection.trigger('x');
  });

  QUnit.test('Provide function for el.', function(assert) {
    assert.expect(2);
    var View = Backbone.View.extend({
      el: function() {
        return '<p><a></a></p>';
      }
    });

    var myView = new View;
    assert.equal(myView.el.tagName, 'P');
    assert.ok(myView.el.querySelector('a'));
  });

  QUnit.test('events passed in options', function(assert) {
    assert.expect(1);
    var counter = 0;

    var View = Backbone.View.extend({
      el: '#testElement',
      increment: function() {
        counter++;
      }
    });

    var myView = new View({
      events: {
        'click h1': 'increment'
      }
    });

    triggerEvent(myView.$('h1')[0], 'click');
    triggerEvent(myView.$('h1')[0], 'click');
    assert.equal(counter, 2);
  });

  QUnit.test('remove', function(assert) {
    assert.expect(2);
    var myView = new Backbone.View;
    document.body.appendChild(myView.el);

    myView.delegate('click', function() { assert.ok(false); });
    myView.listenTo(myView, 'all x', function() { assert.ok(false); });

    assert.equal(myView.remove(), myView, '#remove returns the view instance');
    triggerEvent(myView.el, 'click');
    myView.trigger('x');

    // In IE8 and below, parentNode still exists but is not document.body.
    assert.notEqual(myView.el.parentNode, document.body);
  });

  QUnit.test('setElement', function(assert) {
    assert.expect(3);
    var myView = new Backbone.View({
      events: {
        click: function() { assert.ok(false); }
      }
    });
    myView.events = {
      click: function() { assert.ok(true); }
    };
    var oldEl = myView.el;

    myView.setElement(document.createElement('div'));

    triggerEvent(oldEl, 'click');
    triggerEvent(myView.el, 'click');

    assert.notEqual(oldEl, myView.el);
    assert.ok(myView.el);
  });

})(QUnit);
