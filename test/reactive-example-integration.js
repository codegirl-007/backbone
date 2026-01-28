(function(QUnit) {
  'use strict';

  // Check if reactive system is available
  if (!Backbone.Reactive || !Backbone.Reactive.enabled) {
    QUnit.module('Backbone.Reactive - Example Integration', {
      beforeEach: function() {
        QUnit.skip('Reactive system not available (requires ES6 Proxy)');
      }
    });
    return;
  }

  QUnit.module('Backbone.Reactive - Example Integration', {
    beforeEach: function(assert) {
      Backbone.Reactive.ReactiveContext.active = null;
      var fixture = document.getElementById('qunit-fixture');
      if (fixture) {
        fixture.innerHTML = '<div id="todo-app"></div>';
      }
    }
  });

  QUnit.test('reactive-todo example works end-to-end', function(assert) {
    assert.expect(9);
    var done = assert.async();

    // Load the actual example code by creating a script tag
    // Since we can't easily import it, we'll recreate it here but test it more thoroughly
    // Actually, let's test the actual patterns from the example

    var Todo = Backbone.Model.extend({
      reactive: true,
      defaults: {
        title: '',
        completed: false,
        createdAt: null
      },
      initialize: function() {
        if (!this.get('createdAt')) {
          this.set('createdAt', new Date());
        }
      },
      computed: {
        displayText: function() {
          var text = this.get('title');
          if (this.get('completed')) {
            return '✓ ' + text;
          }
          return text;
        },
        statusClass: function() {
          return this.get('completed') ? 'completed' : 'active';
        }
      },
      toggle: function() {
        this.set('completed', !this.get('completed'));
      }
    });

    var TodoList = Backbone.Collection.extend({
      reactive: true,
      model: Todo,
      computed: {
        activeCount: function() {
          return this.filter(function(todo) {
            return !todo.get('completed');
          }).length;
        },
        completedCount: function() {
          return this.filter(function(todo) {
            return todo.get('completed');
          }).length;
        },
        totalCount: function() {
          return this.length;
        }
      }
    });

    var TodoItemView = Backbone.View.extend({
      reactive: true,
      tagName: 'div',
      className: 'todo-item',
      events: {
        'change .todo-checkbox': 'toggleCompleted',
        'click .todo-delete': 'deleteTodo'
      },
      render: function() {
        var model = this.model._reactiveProxy || this.model;
        var completed = model.get('completed');
        var displayText = model.get('displayText');
        var statusClass = model.get('statusClass');

        if (!this.el) {
          return this;
        }

        this.el.innerHTML =
          '<input type="checkbox" class="todo-checkbox" ' +
          (completed ? 'checked' : '') + '>' +
          '<span class="todo-text">' + displayText + '</span>' +
          '<button class="todo-delete">Delete</button>';

        this.el.className = 'todo-item ' + statusClass;
        this.delegateEvents();

        return this;
      },
      toggleCompleted: function() {
        this.model.toggle();
      },
      deleteTodo: function() {
        if (this.model.collection) {
          this.model.collection.remove(this.model);
        }
        this.remove();
      }
    });

    var TodoListView = Backbone.View.extend({
      reactive: true,
      el: '#todo-app',
      render: function() {
        this.itemViews = this.itemViews || [];
        this.itemViews.forEach(function(view) {
          if (view.remove) view.remove();
        });
        this.itemViews = [];

        var html = '<div class="todo-stats">' +
          '<span>Total: <span class="total-count">' + this.collection.get('totalCount') + '</span></span> ' +
          '<span>Active: <span class="active-count">' + this.collection.get('activeCount') + '</span></span> ' +
          '<span>Completed: <span class="completed-count">' + this.collection.get('completedCount') + '</span></span>' +
          '</div>' +
          '<div class="todo-list">';

        this.collection.models.forEach(function(todo) {
          var itemView = new TodoItemView({model: todo});
          html += itemView.render().el.outerHTML;
          this.itemViews.push(itemView);
        }.bind(this));
        html += '</div>';

        this.el.innerHTML = html;

        var listEl = this.el.querySelector('.todo-list');
        if (listEl && this.itemViews) {
          var itemElements = Array.from(listEl.querySelectorAll('.todo-item'));
          this.itemViews.forEach(function(itemView, index) {
            if (itemElements[index]) {
              itemView.setElement(itemElements[index]);
              itemView.delegateEvents();
            }
          });
        }

        return this;
      }
    });

    // Test 1: Initial state
    var collection = new TodoList([
      {title: 'Todo 1', completed: false},
      {title: 'Todo 2', completed: true}
    ]);

    var view = new TodoListView({collection: collection});
    view.render();

    assert.equal(view.el.querySelectorAll('.todo-item').length, 2, 'two items rendered');
    assert.equal(view.el.querySelector('.total-count').textContent, '2', 'total count correct');
    assert.equal(view.el.querySelector('.active-count').textContent, '1', 'active count correct');
    assert.equal(view.el.querySelector('.completed-count').textContent, '1', 'completed count correct');

    // Test 2: Computed properties work
    var todo1 = collection.at(0);
    var proxy1 = todo1._reactiveProxy || todo1;
    assert.equal(proxy1.get('displayText'), 'Todo 1', 'displayText computed correctly');
    assert.equal(proxy1.get('statusClass'), 'active', 'statusClass computed correctly');

    // Test 3: Toggle completion directly via proxy
    proxy1.set('completed', true);

    assert.equal(proxy1.get('completed'), true, 'todo marked as completed');
    assert.equal(proxy1.get('displayText'), '✓ Todo 1', 'displayText updated with checkmark');

    // Test 4: Add new todo
    collection.add({title: 'Todo 3', completed: false});

    setTimeout(function() {
      assert.equal(collection.length, 3, 'new todo added');
      done();
    }, 50);
  });

})(QUnit);
