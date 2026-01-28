// Reactive Todo App Example
// Demonstrates Backbone.Reactive features:
// - Reactive models with computed properties
// - Auto-updating views without manual event binding
// - Collection reactivity

(function() {
  'use strict';

  // ============================================================================
  // MODEL: Todo with computed properties
  // ============================================================================

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

    // Computed properties - automatically cached and invalidated
    computed: {
      displayText: function() {
        var text = this.get('title');
        if (this.get('completed')) {
          return '✓ ' + text;
        }
        return text;
      },

      formattedDate: function() {
        var date = this.get('createdAt');
        if (!date) return '';
        if (typeof date === 'string') date = new Date(date);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      },

      statusClass: function() {
        return this.get('completed') ? 'completed' : 'active';
      }
    },

    toggle: function() {
      this.set('completed', !this.get('completed'));
    }
  });

  // ============================================================================
  // COLLECTION: Todos
  // ============================================================================

  var TodoList = Backbone.Collection.extend({
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

  // ============================================================================
  // VIEW: Individual Todo Item
  // ============================================================================

  var TodoItemView = Backbone.View.extend({
    reactive: true,

    tagName: 'div',
    className: 'todo-item',

    events: {
      'change .todo-checkbox': 'toggleCompleted',
      'click .todo-delete': 'deleteTodo'
    },

    initialize: function() {
      // No need for manual event binding!
      // The reactive system automatically re-renders when model changes
    },

    render: function() {
      // Access model properties - automatically tracked as dependencies
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

      // Update class based on computed property
      this.el.className = 'todo-item ' + statusClass;

      this.delegateEvents();

      return this;
    },

    toggleCompleted: function() {
      this.model.toggle();
    },

    deleteTodo: function() {
      this.model.destroy();
      this.remove();
    }
  });

  // ============================================================================
  // VIEW: Todo Form
  // ============================================================================

  var TodoFormView = Backbone.View.extend({
    reactive: false, // This view doesn't need reactivity

    el: '.todo-form',

    events: {
      'keypress input': 'createOnEnter'
    },

    createOnEnter: function(e) {
      if (e.keyCode === 13) {
        var input = this.el ? this.el.querySelector('input') : null;
        if (!input) return;

        var title = input.value.trim();

        if (title) {
          this.collection.add({
            title: title,
            completed: false
          });
          input.value = '';
        }
      }
    }
  });

  // ============================================================================
  // VIEW: Todo List (renders collection)
  // ============================================================================

  var TodoListView = Backbone.View.extend({
    reactive: true,

    el: '#todo-app',

    initialize: function() {
      this.formView = new TodoFormView({ collection: this.collection });
    },

    render: function() {
      // Access collection properties - automatically tracked
      var todos = this.collection.models;
      // Calculate counts manually (collection computed properties need collection to be reactive)
      var activeCount = this.collection.filter(function(todo) {
        return !todo.get('completed');
      }).length;
      var completedCount = this.collection.filter(function(todo) {
        return todo.get('completed');
      }).length;
      var totalCount = this.collection.length;

      var html = '<div class="todo-form">' +
        '<input type="text" placeholder="What needs to be done?">' +
        '</div>' +
        '<div class="todo-list">';

      // Store item views so event handlers work
      this.itemViews = this.itemViews || [];

      // Clean up old item views
      this.itemViews.forEach(function(view) {
        if (view.remove) view.remove();
      });
      this.itemViews = [];

      todos.forEach(function(todo) {
        var itemView = new TodoItemView({ model: todo });
        html += itemView.render().el.outerHTML;
        this.itemViews.push(itemView);
      }.bind(this));

      html += '</div>' +
        '<div class="todo-stats">' +
        '<strong>' + totalCount + '</strong> total, ' +
        '<strong>' + activeCount + '</strong> active, ' +
        '<strong>' + completedCount + '</strong> completed' +
        '</div>';

      if (this.el) {
        this.el.innerHTML = html;

        // Re-attach item views to their DOM elements and set up events
        var listEl = this.el.querySelector('.todo-list');
        if (listEl && this.itemViews) {
          var itemElements = Array.from(listEl.querySelectorAll('.todo-item'));
          this.itemViews.forEach(function(itemView, index) {
            if (itemElements[index]) {
              // Use setElement to attach the view to the DOM element
              itemView.setElement(itemElements[index]);
              // delegateEvents is called automatically by setElement, but ensure it's set up
              itemView.delegateEvents();
            }
          });
        }

        // Re-attach form view to new DOM element
        var formEl = this.el.querySelector('.todo-form');
        if (formEl && this.formView) {
          this.formView.setElement(formEl);
          this.formView.delegateEvents();
        }
      }

      return this;
    }
  });

  // ============================================================================
  // APP: Initialize
  // ============================================================================

  var todos = new TodoList([
    { title: 'Learn Backbone.Reactive', completed: false },
    { title: 'Build awesome app', completed: false },
    { title: 'Celebrate!', completed: true }
  ]);

  var app = new TodoListView({ collection: todos });
  app.render();
})();
