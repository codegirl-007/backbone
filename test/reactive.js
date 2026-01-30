(function(QUnit) {
  'use strict';

  // Check if reactive system is available
  if (!Backbone.Reactive || !Backbone.Reactive.enabled) {
    QUnit.module('Backbone.Reactive', {
      beforeEach: function() {
        QUnit.skip('Reactive system not available (requires ES6 Proxy)');
      }
    });
    return;
  }

  QUnit.module('Backbone.Reactive - Core Infrastructure', {
    beforeEach: function() {
      // Reset reactive system state
      Backbone.Reactive.ReactiveContext.active = null;
    }
  });

  QUnit.test('Reactive system is loaded', function(assert) {
    assert.expect(5);
    assert.ok(Backbone.Reactive, 'Backbone.Reactive namespace exists');
    assert.ok(Backbone.Reactive.enabled, 'Reactive system is enabled');
    assert.ok(Backbone.Reactive.wrap, 'wrap function exists');
    assert.ok(Backbone.Reactive.tracker, 'tracker exists');
    assert.ok(Backbone.Reactive.scheduler, 'scheduler exists');
  });

  QUnit.test('ReactiveContext tracks dependencies', function(assert) {
    assert.expect(4);
    var context = new Backbone.Reactive.ReactiveContext();
    var model = new Backbone.Model({name: 'Test'});

    context.addDependency(model, 'name');
    assert.equal(context.dependencies.size, 1, 'dependency added');
    assert.ok(!context.isEmpty(), 'context is not empty');

    context.clear();
    assert.equal(context.dependencies.size, 0, 'dependencies cleared');
    assert.ok(context.isEmpty(), 'context is empty');
  });

  QUnit.test('ReactiveContext deduplicates dependencies', function(assert) {
    assert.expect(2);
    var context = new Backbone.Reactive.ReactiveContext();
    var model = new Backbone.Model({name: 'Test'});

    context.addDependency(model, 'name');
    context.addDependency(model, 'name'); // Duplicate
    assert.equal(context.dependencies.size, 1, 'duplicate not added');

    context.addDependency(model, 'email');
    assert.equal(context.dependencies.size, 2, 'different property added');
  });

  QUnit.test('ReactiveContext.run sets active context', function(assert) {
    assert.expect(3);
    var context = new Backbone.Reactive.ReactiveContext();
    var model = new Backbone.Model({name: 'Test'});

    assert.equal(Backbone.Reactive.ReactiveContext.active, null, 'no active context initially');

    Backbone.Reactive.ReactiveContext.run(function() {
      assert.equal(Backbone.Reactive.ReactiveContext.active, context, 'context is active');
      Backbone.Reactive.ReactiveContext.active.addDependency(model, 'name');
    }, context);

    assert.equal(Backbone.Reactive.ReactiveContext.active, null, 'context restored after run');
  });

  QUnit.module('Backbone.Reactive - Model Wrapping', {
    beforeEach: function() {
      Backbone.Reactive.ReactiveContext.active = null;
    }
  });

  QUnit.test('wrap creates reactive proxy', function(assert) {
    assert.expect(3);
    var model = new Backbone.Model({name: 'Test'});
    var proxy = Backbone.Reactive.wrap(model);

    assert.ok(proxy, 'proxy created');
    assert.notEqual(proxy, model, 'proxy is different object');
    assert.equal(model._reactiveProxy, proxy, 'proxy stored on model');
  });

  QUnit.test('wrap returns same proxy on multiple calls', function(assert) {
    assert.expect(1);
    var model = new Backbone.Model({name: 'Test'});
    var proxy1 = Backbone.Reactive.wrap(model);
    var proxy2 = Backbone.Reactive.wrap(model);

    assert.equal(proxy1, proxy2, 'same proxy returned');
  });

  QUnit.test('proxy get tracks dependencies', function(assert) {
    assert.expect(3);
    var model = new Backbone.Model({name: 'Test', email: 'test@example.com'});
    var proxy = Backbone.Reactive.wrap(model);
    var context = new Backbone.Reactive.ReactiveContext();

    Backbone.Reactive.ReactiveContext.run(function() {
      proxy.get('name');
      proxy.get('email');
    }, context);

    assert.equal(context.dependencies.size, 2, 'both properties tracked');
    var deps = Array.from(context.dependencies.values());
    assert.ok(deps.some(function(d) { return d.prop === 'name'; }), 'name tracked');
    assert.ok(deps.some(function(d) { return d.prop === 'email'; }), 'email tracked');
  });

  QUnit.test('proxy get returns correct values', function(assert) {
    assert.expect(2);
    var model = new Backbone.Model({name: 'Test', count: 42});
    var proxy = Backbone.Reactive.wrap(model);

    assert.equal(proxy.get('name'), 'Test', 'string value correct');
    assert.equal(proxy.get('count'), 42, 'number value correct');
  });

  QUnit.test('proxy set updates model', function(assert) {
    assert.expect(2);
    var model = new Backbone.Model({name: 'Test'});
    var proxy = Backbone.Reactive.wrap(model);

    proxy.set('name', 'Updated');
    assert.equal(model.get('name'), 'Updated', 'model updated');
    assert.equal(proxy.get('name'), 'Updated', 'proxy reflects update');
  });

  QUnit.module('Backbone.Reactive - Computed Properties', {
    beforeEach: function() {
      Backbone.Reactive.ReactiveContext.active = null;
    }
  });

  QUnit.test('computed properties are defined', function(assert) {
    assert.expect(1);
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        fullName: function() {
          return this.get('firstName') + ' ' + this.get('lastName');
        }
      }
    });

    var user = new User({firstName: 'John', lastName: 'Doe'});
    assert.ok(user._computed, 'computed properties stored');
  });

  QUnit.test('computed properties compute correctly', function(assert) {
    assert.expect(2);
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        fullName: function() {
          return this.get('firstName') + ' ' + this.get('lastName');
        }
      }
    });

    var user = new User({firstName: 'John', lastName: 'Doe'});
    var proxy = user._reactiveProxy || user;

    // Access computed property through proxy
    var context = new Backbone.Reactive.ReactiveContext();
    Backbone.Reactive.ReactiveContext.run(function() {
      var fullName = proxy.get('fullName');
      assert.equal(fullName, 'John Doe', 'computed property works');
    }, context);

    // Access again - should use cache
    var fullName2 = proxy.get('fullName');
    assert.equal(fullName2, 'John Doe', 'cached value works');
  });

  QUnit.test('computed properties work when _computed is on prototype', function(assert) {
    assert.expect(2);
    // This tests the fix for computed properties not being found when stored on prototype
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        displayName: function() {
          return this.get('name') + ' (' + this.get('email') + ')';
        }
      }
    });

    var user = new User({name: 'John', email: 'john@example.com'});
    // Access computed property - should work even though _computed is on prototype
    var proxy = user._reactiveProxy || user;
    var displayName = proxy.get('displayName');

    assert.equal(displayName, 'John (john@example.com)', 'computed property works when on prototype');
    assert.notEqual(displayName, 'undefined', 'computed property does not return undefined');
  });

  QUnit.test('computed properties cache results', function(assert) {
    assert.expect(4);
    var callCount = 0;
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        expensive: function() {
          callCount++;
          return this.get('value') * 2;
        }
      }
    });

    var user = new User({value: 5});
    var proxy = user._reactiveProxy || user;

    var context = new Backbone.Reactive.ReactiveContext();
    Backbone.Reactive.ReactiveContext.run(function() {
      proxy.get('expensive');
      proxy.get('expensive'); // Second call should use cache
    }, context);

    assert.equal(callCount, 1, 'computed only called once');
    assert.equal(proxy.get('expensive'), 10, 'result correct');

    // Update dependency
    proxy.set('value', 10);
    // Cache should be invalidated, so next access recomputes
    var context2 = new Backbone.Reactive.ReactiveContext();
    Backbone.Reactive.ReactiveContext.run(function() {
      proxy.get('expensive');
    }, context2);
    assert.equal(callCount, 2, 'recomputed after dependency change');
    assert.equal(proxy.get('expensive'), 20, 'new value correct');
  });

  QUnit.test('computed properties track their dependencies', function(assert) {
    assert.expect(3);
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        fullName: function() {
          return this.get('firstName') + ' ' + this.get('lastName');
        },
        displayName: function() {
          return this.get('fullName') + ' (' + this.get('email') + ')';
        }
      }
    });

    var user = new User({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com'
    });
    var proxy = user._reactiveProxy || user;

    // Access computed property - should track dependencies
    var context = new Backbone.Reactive.ReactiveContext();
    Backbone.Reactive.ReactiveContext.run(function() {
      proxy.get('fullName');
    }, context);

    // Check that dependencies were tracked
    var deps = Array.from(context.dependencies.values());
    assert.ok(deps.some(function(d) { return d.prop === 'firstName'; }), 'firstName tracked');
    assert.ok(deps.some(function(d) { return d.prop === 'lastName'; }), 'lastName tracked');
    assert.equal(deps.length, 2, 'both dependencies tracked');
  });

  QUnit.test('computed property invalidation cascades', function(assert) {
    assert.expect(3);
    var callCounts = {fullName: 0, displayName: 0};
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        fullName: function() {
          callCounts.fullName++;
          return this.get('firstName') + ' ' + this.get('lastName');
        },
        displayName: function() {
          callCounts.displayName++;
          return this.get('fullName') + ' (' + this.get('email') + ')';
        }
      }
    });

    var user = new User({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com'
    });
    var proxy = user._reactiveProxy || user;

    // Access displayName which depends on fullName
    proxy.get('displayName');

    assert.equal(callCounts.fullName, 1, 'fullName computed once');
    assert.equal(callCounts.displayName, 1, 'displayName computed once');

    // Change firstName - should invalidate both fullName and displayName
    proxy.set('firstName', 'Jane');

    // Access displayName again - both should recompute
    proxy.get('displayName');

    // fullName should have been computed only once more (not called directly)
    assert.equal(callCounts.fullName, 2, 'fullName recomputed when displayName accessed');
  });

  QUnit.test('computed properties detect circular dependencies', function(assert) {
    assert.expect(1);
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        a: function() { return this.get('b'); },
        b: function() { return this.get('a'); }
      }
    });

    var user = new User();
    var proxy = user._reactiveProxy || user;

    try {
      var context = new Backbone.Reactive.ReactiveContext();
      Backbone.Reactive.ReactiveContext.run(function() {
        proxy.get('a');
      }, context);
      assert.ok(false, 'should have thrown error');
    } catch (e) {
      assert.ok(e.message.indexOf('Circular dependency') !== -1, 'circular dependency detected');
    }
  });

  QUnit.module('Backbone.Reactive - View Auto-Updates', {
    beforeEach: function(assert) {
      Backbone.Reactive.ReactiveContext.active = null;
      var fixture = document.getElementById('qunit-fixture');
      if (fixture) {
        fixture.innerHTML = '<div id="test-view"></div>';
      }
    }
  });

  QUnit.test('reactive view tracks model dependencies', function(assert) {
    assert.expect(3);
    var model = new Backbone.Model({name: 'Test'});
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: model,
      render: function() {
        renderCount++;
        if (this.el) {
          this.el.innerHTML = this.model.get('name');
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();

    assert.equal(renderCount, 1, 'render called once');
    assert.ok(view._reactiveContext, 'reactive context created');
    assert.ok(view._reactiveListeners, 'reactive listeners set up');
  });

  QUnit.test('reactive view does not cause stack overflow', function(assert) {
    assert.expect(3);
    var model = new Backbone.Model({name: 'Test', email: 'test@example.com'});

    var ReactiveUser = Backbone.Model.extend({
      reactive: true,
      computed: {
        displayName: function() {
          return this.get('name') + ' (' + this.get('email') + ')';
        }
      }
    });

    var user = new ReactiveUser({name: 'John', email: 'john@example.com'});

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: user,
      render: function() {
        var name = this.model.get('name');
        var email = this.model.get('email');
        var displayName = this.model.get('displayName');

        if (this.el) {
          this.el.innerHTML = name + ' - ' + email + ' - ' + displayName;
        }
        return this;
      }
    });

    var view = new TestView();

    // This should not cause stack overflow
    try {
      view.render();
      assert.ok(true, 'render completed without stack overflow');
      assert.equal(view.el ? view.el.innerHTML : '', 'John - john@example.com - John (john@example.com)', 'content correct');

      // Update model - should not cause stack overflow
      user.set('name', 'Jane');
      assert.ok(true, 'model update completed without stack overflow');
    } catch (e) {
      if (e.message.indexOf('Maximum call stack') !== -1) {
        assert.ok(false, 'Stack overflow occurred: ' + e.message);
      } else {
        throw e;
      }
    }
  });

  QUnit.test('reactive view auto-updates on model change', function(assert) {
    assert.expect(4);
    var done = assert.async();
    var model = new Backbone.Model({name: 'Test', email: 'test@example.com'});
    var renderCount = 0;
    var lastRenderedValue = null;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: model,
      render: function() {
        renderCount++;
        lastRenderedValue = this.model.get('name');
        if (this.el) {
          this.el.innerHTML = lastRenderedValue;
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();
    assert.equal(renderCount, 1, 'initial render');
    assert.equal(lastRenderedValue, 'Test', 'initial value rendered');

    // Change model - should trigger re-render via event listener
    model.set('name', 'Updated');

    // Wait for scheduler to flush (or event to fire)
    var attempts = 0;
    var maxAttempts = 50; // 500ms max wait
    var checkRender = function() {
      attempts++;
      if (renderCount >= 2) {
        // Success path: 2 assertions
        assert.equal(renderCount, 2, 'view re-rendered on change');
        assert.equal(view.el ? view.el.innerHTML : '', 'Updated', 'view updated with new value');
        done();
      } else if (attempts < maxAttempts) {
        setTimeout(checkRender, 10);
      } else {
        // Timeout path: 2 assertions to match success path
        assert.equal(renderCount, 1, 'view did not re-render (still at initial render count)');
        assert.ok(false, 'view did not re-render within timeout');
        done();
      }
    };
    setTimeout(checkRender, 10);
  });

  QUnit.test('reactive view does NOT update on unrelated property change', function(assert) {
    assert.expect(2);
    var done = assert.async();
    var model = new Backbone.Model({name: 'Test', email: 'test@example.com'});
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: model,
      render: function() {
        renderCount++;
        // Only access 'name', not 'email'
        if (this.el) {
          this.el.innerHTML = this.model.get('name');
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();
    assert.equal(renderCount, 1, 'initial render');

    // Change unrelated property - should NOT trigger re-render
    model.set('email', 'new@example.com');

    setTimeout(function() {
      assert.equal(renderCount, 1, 'view did NOT re-render on unrelated change');
      done();
    }, 50);
  });

  QUnit.test('reactive view tracks only accessed properties', function(assert) {
    assert.expect(3);
    var done = assert.async();
    var model = new Backbone.Model({name: 'Test', email: 'test@example.com', age: 25});
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: model,
      render: function() {
        renderCount++;
        // Only access 'name'
        if (this.el) {
          this.el.innerHTML = this.model.get('name');
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();

    // Check that only 'name' is tracked
    var deps = Array.from(view._reactiveContext.dependencies.values());
    assert.equal(deps.length, 1, 'only one dependency tracked');
    assert.equal(deps[0].prop, 'name', 'correct property tracked');

    // Change untracked property - should not re-render
    model.set('email', 'new@example.com');
    setTimeout(function() {
      assert.equal(renderCount, 1, 'did not re-render for untracked property');
      done();
    }, 50);
  });

  QUnit.test('scheduler batches rapid updates', function(assert) {
    assert.expect(3);
    var done = assert.async();
    var model = new Backbone.Model({count: 0});
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: model,
      render: function() {
        renderCount++;
        if (this.el) {
          this.el.innerHTML = 'Count: ' + this.model.get('count');
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();
    assert.equal(renderCount, 1, 'initial render');

    // Rapid-fire multiple changes
    model.set('count', 1);
    model.set('count', 2);
    model.set('count', 3);
    model.set('count', 4);
    model.set('count', 5);

    // Should batch into single render (or at most a few)
    setTimeout(function() {
      // Should be 2 renders total (initial + batched), not 6 (one per set)
      assert.ok(renderCount <= 3, 'rapid updates batched (renders: ' + renderCount + ')');
      assert.equal(view.el ? view.el.innerHTML : '', 'Count: 5', 'final value correct');
      done();
    }, 100);
  });

  QUnit.test('reactive view cleanup on remove', function(assert) {
    assert.expect(5);
    var done = assert.async();
    var model = new Backbone.Model({name: 'Test'});

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-view',
      model: model,
      render: function() {
        if (this.el) {
          this.el.innerHTML = this.model.get('name');
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();

    // Check that reactive context and listeners exist
    assert.ok(view._reactiveContext, 'context exists');
    assert.ok(view._reactiveListeners, 'listeners exist');

    // Check that listeners is an array (it might be empty if dependencies weren't tracked)
    assert.ok(Array.isArray(view._reactiveListeners), 'listeners is an array');

    view.remove();
    setTimeout(function() {
      assert.equal(view._reactiveContext, null, 'context cleared');
      assert.equal(view._reactiveListeners, null, 'listeners cleared');
      done();
    }, 0);
  });

  QUnit.test('non-reactive view works normally', function(assert) {
    assert.expect(2);
    var model = new Backbone.Model({name: 'Test'});
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      el: '#test-view',
      model: model,
      render: function() {
        renderCount++;
        if (this.el) {
          this.el.innerHTML = this.model.get('name');
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();

    assert.equal(renderCount, 1, 'render called');
    assert.ok(!view._reactiveContext, 'no reactive context for non-reactive view');
  });

  QUnit.module('Backbone.Reactive - Collection Reactivity', {
    beforeEach: function(assert) {
      Backbone.Reactive.ReactiveContext.active = null;
      var fixture = document.getElementById('qunit-fixture');
      if (fixture) {
        fixture.innerHTML = '<div id="test-collection-view"></div>';
      }
    }
  });

  QUnit.test('reactive view updates on collection add', function(assert) {
    assert.expect(4);
    var done = assert.async();
    var collection = new Backbone.Collection([{id: 1, name: 'Item 1'}]);
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-collection-view',
      collection: collection,
      render: function() {
        renderCount++;
        if (this.el) {
          this.el.innerHTML = 'Count: ' + this.collection.length;
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();
    assert.equal(renderCount, 1, 'initial render');
    assert.equal(view.el ? view.el.innerHTML : '', 'Count: 1', 'initial count');

    collection.add({id: 2, name: 'Item 2'});

    setTimeout(function() {
      assert.equal(renderCount, 2, 'view re-rendered on add');
      assert.equal(view.el ? view.el.innerHTML : '', 'Count: 2', 'count updated');
      done();
    }, 50);
  });

  QUnit.test('reactive view updates on collection remove', function(assert) {
    assert.expect(2);
    var done = assert.async();
    var collection = new Backbone.Collection([
      {id: 1, name: 'Item 1'},
      {id: 2, name: 'Item 2'}
    ]);
    var renderCount = 0;

    var TestView = Backbone.View.extend({
      reactive: true,
      el: '#test-collection-view',
      collection: collection,
      render: function() {
        renderCount++;
        if (this.el) {
          this.el.innerHTML = 'Count: ' + this.collection.length;
        }
        return this;
      }
    });

    var view = new TestView();
    view.render();

    collection.remove(collection.at(0));

    setTimeout(function() {
      assert.equal(renderCount, 2, 'view re-rendered on remove');
      assert.equal(view.el ? view.el.innerHTML : '', 'Count: 1', 'count updated');
      done();
    }, 50);
  });

  QUnit.test('reactive view with item views - delete button works', function(assert) {
    assert.expect(4);
    var done = assert.async();
    var Todo = Backbone.Model.extend({
      reactive: true,
      defaults: {
        title: ''
      },
      computed: {
        displayText: function() {
          return this.get('title');
        }
      }
    });

    var TodoList = Backbone.Collection.extend({
      model: Todo
    });

    var TodoItemView = Backbone.View.extend({
      reactive: true,
      tagName: 'div',
      className: 'todo-item',
      events: {
        'click .todo-delete': 'deleteTodo'
      },
      render: function() {
        var title = this.model.get('displayText');
        this.el.innerHTML = '<span class="todo-text">' + title + '</span><button class="todo-delete">Delete</button>';
        this.delegateEvents();
        return this;
      },
      deleteTodo: function() {
        // Remove from collection instead of destroy to avoid sync
        if (this.model.collection) {
          this.model.collection.remove(this.model);
        }
        this.remove();
      }
    });

    var TodoListView = Backbone.View.extend({
      reactive: true,
      el: '#test-collection-view',
      render: function() {
        this.itemViews = this.itemViews || [];
        this.itemViews.forEach(function(view) {
          if (view.remove) view.remove();
        });
        this.itemViews = [];

        var html = '<div class="todo-list">';
        this.collection.models.forEach(function(todo) {
          var itemView = new TodoItemView({model: todo});
          html += itemView.render().el.outerHTML;
          this.itemViews.push(itemView);
        }.bind(this));
        html += '</div>';

        this.el.innerHTML = html;

        // Re-attach item views to DOM elements
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

    var collection = new TodoList([
      {title: 'Todo 1'},
      {title: 'Todo 2'}
    ]);

    var view = new TodoListView({collection: collection});
    view.render();

    assert.equal(view.el.querySelectorAll('.todo-item').length, 2, 'two items rendered');

    // Click delete button on first item
    var deleteBtn = view.el.querySelector('.todo-delete');
    assert.ok(deleteBtn, 'delete button exists');

    // Use a timeout to ensure click handler fires and reactive updates complete
    setTimeout(function() {
      deleteBtn.click();

      // Wait for reactive system to process the change
      setTimeout(function() {
        assert.equal(collection.length, 1, 'item removed from collection');
        // The view should have re-rendered due to collection reactivity
        var remainingItems = view.el.querySelectorAll('.todo-item');
        assert.equal(remainingItems.length, 1, 'one item remains in DOM');
        done();
      }, 50);
    }, 10);
  });

  QUnit.test('computed properties work when accessed through proxy in view render', function(assert) {
    assert.expect(3);
    var User = Backbone.Model.extend({
      reactive: true,
      computed: {
        displayText: function() {
          var name = this.get('name');
          if (this.get('completed')) {
            return '✓ ' + name;
          }
          return name;
        }
      }
    });

    var user = new User({name: 'Test User', completed: false});
    var proxy = user._reactiveProxy || user;

    // Simulate what happens in a view render
    var context = new Backbone.Reactive.ReactiveContext();
    Backbone.Reactive.ReactiveContext.run(function() {
      var displayText = proxy.get('displayText');
      assert.equal(displayText, 'Test User', 'computed property returns correct value');
    }, context);

    // Check dependencies were tracked
    var deps = Array.from(context.dependencies.values());
    assert.ok(deps.some(function(d) { return d.prop === 'name'; }), 'name dependency tracked');
    assert.ok(deps.some(function(d) { return d.prop === 'completed'; }), 'completed dependency tracked');
  });

  QUnit.test('collection computed properties work', function(assert) {
    assert.expect(2);
    var TodoList = Backbone.Collection.extend({
      reactive: true,
      computed: {
        activeCount: function() {
          return this.filter(function(todo) {
            return !todo.get('completed');
          }).length;
        },
        totalCount: function() {
          return this.length;
        }
      }
    });

    var collection = new TodoList([
      {title: 'Todo 1', completed: false},
      {title: 'Todo 2', completed: true}
    ]);

    var proxy = collection._reactiveProxy || collection;
    var activeCount = proxy.get('activeCount');
    var totalCount = proxy.get('totalCount');

    assert.equal(activeCount, 1, 'activeCount computed correctly');
    assert.equal(totalCount, 2, 'totalCount computed correctly');
  });

  QUnit.module('Backbone.Reactive - Backward Compatibility', {
    beforeEach: function() {
      Backbone.Reactive.ReactiveContext.active = null;
    }
  });

  QUnit.test('non-reactive models work normally', function(assert) {
    assert.expect(3);
    var User = Backbone.Model.extend({});
    var user = new User({name: 'Test'});

    assert.ok(user, 'model created');
    assert.equal(user.get('name'), 'Test', 'get works');
    user.set('name', 'Updated');
    assert.equal(user.get('name'), 'Updated', 'set works');
  });

  QUnit.test('can mix reactive and non-reactive models', function(assert) {
    assert.expect(4);
    var ReactiveUser = Backbone.Model.extend({reactive: true});
    var NormalUser = Backbone.Model.extend({});

    var reactiveUser = new ReactiveUser({name: 'Reactive'});
    var normalUser = new NormalUser({name: 'Normal'});

    assert.ok(reactiveUser._reactiveProxy, 'reactive user has proxy');
    assert.ok(!normalUser._reactiveProxy, 'normal user has no proxy');
    assert.equal(reactiveUser.get('name'), 'Reactive', 'reactive user works');
    assert.equal(normalUser.get('name'), 'Normal', 'normal user works');
  });

  QUnit.test('manual event binding still works', function(assert) {
    assert.expect(2);
    var model = new Backbone.Model({name: 'Test'});
    var callCount = 0;

    model.on('change:name', function() {
      callCount++;
    });

    model.set('name', 'Updated');
    assert.equal(callCount, 1, 'manual listener fired');

    var ReactiveUser = Backbone.Model.extend({reactive: true});
    var user = new ReactiveUser({name: 'Test'});
    callCount = 0;

    user.on('change:name', function() {
      callCount++;
    });

    user.set('name', 'Updated');
    assert.equal(callCount, 1, 'manual listener works with reactive model');
  });

  QUnit.module('Backbone.Reactive - Safety Tests', {
    beforeEach: function() {
      Backbone.Reactive.ReactiveContext.active = null;
    }
  });

  QUnit.test('autorun prevents synchronous reentrancy', function(assert) {
    assert.expect(2);

    var model = new Backbone.Model({count: 0});
    var proxy = Backbone.Reactive.wrap(model);
    var executing = false;
    var reentrantCallDetected = false;
    var runs = 0;
    var MAX_RUNS = 50;

    var dispose = Backbone.Reactive.autorun(function() {
      runs++;
      if (runs > MAX_RUNS) {
        assert.ok(false, 'autorun runaway (possible loop)');
        return;
      }

      if (executing) {
        reentrantCallDetected = true;
        return;
      }
      executing = true;

      var current = proxy.get('count');
      if (current < 5) proxy.set('count', current + 1);

      executing = false;
    });

    assert.ok(runs <= MAX_RUNS, 'autorun did not runaway');
    assert.notOk(reentrantCallDetected, 'autorun did not synchronously re-enter itself');

    dispose();
  });

  QUnit.test('batch deduplicates multiple autoruns for same fn', function(assert) {
    assert.expect(2);

    var model = new Backbone.Model({name: 'Initial'});
    var proxy = Backbone.Reactive.wrap(model);
    var runCount = 0;

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      proxy.get('name');
    });

    assert.equal(runCount, 1, 'runs once initially');

    Backbone.Reactive.batch(function() {
      proxy.set('name', 'A');  // Triggers change:name
      proxy.set('name', 'B');  // Triggers change:name again
      proxy.set('name', 'C');  // And again
    });

    // Without dedupe: runCount would be 4 (1 initial + 3 reruns)
    // With dedupe: runCount is 2 (1 initial + 1 batched rerun)
    assert.equal(runCount, 2, 'reran only once for batch');

    dispose();
  });

  QUnit.test('batch cancels pending RAF to prevent double flush', function(assert) {
    assert.expect(3);
    var done = assert.async();

    var MyModel = Backbone.Model.extend({
      reactive: true
    });

    var model = new MyModel({value: 0});
    var renderCount = 0;

    var MyView = Backbone.View.extend({
      reactive: true,
      tagName: 'div',
      render: function() {
        renderCount++;
        this.model.get('value');
        return this;
      }
    });

    var view = new MyView({model: model});
    // Attach view to DOM
    var fixture = document.getElementById('qunit-fixture');
    if (fixture) {
      fixture.appendChild(view.el);
    }

    view.render();
    assert.equal(renderCount, 1, 'initial render');

    // Schedule RAF by changing model outside batch
    model.set('value', 1);

    // Immediately batch (flushes synchronously before RAF fires)
    Backbone.Reactive.batch(function() {
      model.set('value', 2);
    });

    assert.equal(renderCount, 2, 'flushed once during batch');

    // Wait for RAF to fire (if not cancelled)
    setTimeout(function() {
      // Without RAF cancel: renderCount would be 3 (RAF flush runs)
      // With RAF cancel: renderCount stays 2 (RAF was cancelled)
      assert.equal(renderCount, 2, 'no second flush from RAF');
      done();
    }, 50);
  });

  QUnit.test('nested batches flush only when outermost completes', function(assert) {
    assert.expect(5);

    var model = new Backbone.Model({a: 0, b: 0, c: 0});
    var proxy = Backbone.Reactive.wrap(model);
    var runCount = 0;

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      proxy.get('a');
      proxy.get('b');
      proxy.get('c');
    });

    assert.equal(runCount, 1, 'initial run');

    Backbone.Reactive.batch(function() {
      proxy.set('a', 1);
      assert.equal(runCount, 1, 'no rerun yet (depth=1)');

      Backbone.Reactive.batch(function() {
        proxy.set('b', 2);
        assert.equal(runCount, 1, 'still no rerun (depth=2)');
      });
      // Depth back to 1 - still no flush
      assert.equal(runCount, 1, 'still no rerun (depth=1 again)');

      proxy.set('c', 3);
    });
    // Depth now 0 - flush happens

    assert.equal(runCount, 2, 'reran once after outermost batch');

    dispose();
  });

  QUnit.test('collection computed invalidates when child model changes', function(assert) {
    assert.expect(3);

    var TodoList = Backbone.Collection.extend({
      reactive: true,
      computed: {
        activeCount: function() {
          return this.filter(function(m) {
            return !m.get('completed');
          }).length;
        }
      }
    });

    var todos = new TodoList([
      {id: 1, title: 'Task 1', completed: false},
      {id: 2, title: 'Task 2', completed: false}
    ]);

    var proxy = Backbone.Reactive.wrap(todos);
    assert.equal(proxy.get('activeCount'), 2, 'initially 2 active');

    // Change child model
    todos.at(0).set('completed', true);

    // Without invalidation: activeCount returns cached 2 (WRONG)
    // With invalidation: activeCount recomputes to 1 (CORRECT)
    assert.equal(proxy.get('activeCount'), 1, 'activeCount updated after child change');

    todos.at(1).set('completed', true);
    assert.equal(proxy.get('activeCount'), 0, 'activeCount updated again');
  });

  QUnit.module('Backbone.Reactive - Correctness Tests', {
    beforeEach: function() {
      Backbone.Reactive.ReactiveContext.active = null;
      var fixture = document.getElementById('qunit-fixture');
      if (fixture) {
        fixture.innerHTML = '<div id="test-view"></div>';
      }
    }
  });

  // Autorun Lifecycle Tests

  QUnit.test('autorun disposal stops all tracking', function(assert) {
    assert.expect(2);

    var model = new Backbone.Model({count: 0});
    var proxy = Backbone.Reactive.wrap(model);
    var runCount = 0;

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      proxy.get('count');
    });

    assert.equal(runCount, 1, 'runs once initially');

    dispose();

    proxy.set('count', 1);
    proxy.set('count', 2);

    assert.equal(runCount, 1, 'does not run after disposal');
  });

  QUnit.test('autorun conditional dependency tracking', function(assert) {
    assert.expect(4);

    var model = new Backbone.Model({flag: true, a: 1, b: 1});
    var proxy = Backbone.Reactive.wrap(model);
    var runCount = 0;

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      if (proxy.get('flag')) {
        proxy.get('a');
      } else {
        proxy.get('b');
      }
    });

    assert.equal(runCount, 1, 'runs once initially');

    proxy.set('b', 2);
    assert.equal(runCount, 1, 'does not rerun when unread property changes');

    proxy.set('a', 2);
    assert.equal(runCount, 2, 'reruns when read property changes');

    proxy.set('flag', false);
    proxy.set('a', 3);
    assert.equal(runCount, 3, 'does not rerun when previously-read property changes after flag switch');

    dispose();
  });

  QUnit.test('autorun tracks multiple models', function(assert) {
    assert.expect(4);

    var model1 = new Backbone.Model({value: 1});
    var model2 = new Backbone.Model({value: 2});
    var proxy1 = Backbone.Reactive.wrap(model1);
    var proxy2 = Backbone.Reactive.wrap(model2);
    var runCount = 0;

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      proxy1.get('value');
      proxy2.get('value');
    });

    assert.equal(runCount, 1, 'runs once initially');

    proxy1.set('value', 10);
    assert.equal(runCount, 2, 'reruns when first model changes');

    proxy2.set('value', 20);
    assert.equal(runCount, 3, 'reruns when second model changes');

    proxy1.set('value', 30);
    assert.equal(runCount, 4, 'reruns when first model changes again');

    dispose();
  });

  // Computed Correctness Tests

  QUnit.test('computed runtime dependency tracking', function(assert) {
    assert.expect(3);

    var Model = Backbone.Model.extend({
      reactive: true,
      computed: {
        result: function() {
          if (this.get('flag')) {
            return this.get('a');
          }
          return this.get('b');

        }
      }
    });

    var model = new Model({flag: true, a: 1, b: 2});
    var proxy = model._reactiveProxy || Backbone.Reactive.wrap(model);

    assert.equal(proxy.get('result'), 1, 'initial result correct');

    model.set('b', 20);
    assert.equal(proxy.get('result'), 1, 'result unchanged when unread property changes');

    model.set('a', 10);
    assert.equal(proxy.get('result'), 10, 'result updates when read property changes');
  });

  QUnit.test('computed transitive invalidation', function(assert) {
    assert.expect(4);

    var Model = Backbone.Model.extend({
      reactive: true,
      computed: {
        a: function() {
          return this.get('base') * 2;
        },
        b: function() {
          return this.get('a') * 2;
        },
        c: function() {
          return this.get('b') * 2;
        }
      }
    });

    var model = new Model({base: 1});
    var proxy = model._reactiveProxy || Backbone.Reactive.wrap(model);

    assert.equal(proxy.get('c'), 8, 'initial: base=1 -> a=2 -> b=4 -> c=8');

    model.set('base', 2);

    assert.equal(proxy.get('a'), 4, 'a recomputed after base change');
    assert.equal(proxy.get('b'), 8, 'b recomputed after base change');
    assert.equal(proxy.get('c'), 16, 'c recomputed after base change');
  });

  QUnit.test('computed single recompute per change', function(assert) {
    assert.expect(3);

    var computeCount = 0;

    var Model = Backbone.Model.extend({
      reactive: true,
      computed: {
        expensive: function() {
          computeCount++;
          return this.get('value') * 2;
        },
        consumerA: function() {
          return this.get('expensive') + 1;
        },
        consumerB: function() {
          return this.get('expensive') + 2;
        }
      }
    });

    var model = new Model({value: 5});
    var proxy = Backbone.Reactive.wrap(model);

    proxy.get('consumerA');
    proxy.get('consumerB');

    assert.equal(computeCount, 1, 'computed once initially despite two consumers');

    proxy.set('value', 10);

    proxy.get('consumerA');
    proxy.get('consumerB');

    assert.equal(computeCount, 2, 'recomputed once after invalidation despite two consumers');

    proxy.get('consumerA');
    assert.equal(computeCount, 2, 'still only computed twice after additional read');
  });

  QUnit.test('computed cache persists across multiple reads', function(assert) {
    assert.expect(3);

    var computeCount = 0;

    var Model = Backbone.Model.extend({
      reactive: true,
      computed: {
        expensive: function() {
          computeCount++;
          return this.get('value') * 2;
        }
      }
    });

    var model = new Model({value: 5});
    var proxy = model._reactiveProxy || Backbone.Reactive.wrap(model);

    var result1 = proxy.get('expensive');
    var result2 = proxy.get('expensive');
    var result3 = proxy.get('expensive');

    assert.equal(computeCount, 1, 'computed only once for multiple reads');
    assert.equal(result1, 10, 'all reads return same value');
    assert.equal(result2, result3, 'cache stable across reads');
  });

  // Reactive View Cleanup Tests

  QUnit.test('view silent after remove', function(assert) {
    assert.expect(2);
    var done = assert.async();

    var MyModel = Backbone.Model.extend({
      reactive: true
    });

    var model = new MyModel({value: 0});
    var renderCount = 0;

    var MyView = Backbone.View.extend({
      reactive: true,
      tagName: 'div',
      render: function() {
        renderCount++;
        this.model.get('value');
        return this;
      }
    });

    var view = new MyView({model: model});
    var fixture = document.getElementById('qunit-fixture');
    if (fixture) {
      fixture.appendChild(view.el);
    }

    view.render();
    assert.equal(renderCount, 1, 'initial render');

    view.remove();

    model.set('value', 1);
    model.set('value', 2);

    setTimeout(function() {
      assert.equal(renderCount, 1, 'no renders after remove');
      done();
    }, 50);
  });

  QUnit.test('collection computed updates on add/remove', function(assert) {
    assert.expect(4);

    var TodoList = Backbone.Collection.extend({
      reactive: true,
      computed: {
        count: function() {
          return this.length;
        }
      }
    });

    var todos = new TodoList([
      {id: 1, title: 'Task 1'},
      {id: 2, title: 'Task 2'}
    ]);

    var proxy = Backbone.Reactive.wrap(todos);
    assert.equal(proxy.get('count'), 2, 'initial count is 2');

    todos.add({id: 3, title: 'Task 3'});
    assert.equal(proxy.get('count'), 3, 'count updates after add');

    todos.remove(todos.at(0));
    assert.equal(proxy.get('count'), 2, 'count updates after remove');

    todos.reset([{id: 4, title: 'Task 4'}]);
    assert.equal(proxy.get('count'), 1, 'count updates after reset');
  });

  QUnit.test('view conditional dependency tracking', function(assert) {
    assert.expect(3);
    var done = assert.async();

    var MyModel = Backbone.Model.extend({
      reactive: true
    });

    var model = new MyModel({showA: true, a: 1, b: 2});
    var renderCount = 0;

    var MyView = Backbone.View.extend({
      reactive: true,
      tagName: 'div',
      render: function() {
        renderCount++;
        if (this.model.get('showA')) {
          this.model.get('a');
        } else {
          this.model.get('b');
        }
        return this;
      }
    });

    var view = new MyView({model: model});
    var fixture = document.getElementById('qunit-fixture');
    if (fixture) {
      fixture.appendChild(view.el);
    }

    view.render();
    assert.equal(renderCount, 1, 'initial render');

    model.set('b', 20);

    setTimeout(function() {
      assert.equal(renderCount, 1, 'no rerender when unread property changes');

      model.set('a', 10);

      setTimeout(function() {
        assert.equal(renderCount, 2, 'rerenders when read property changes');
        done();
      }, 50);
    }, 50);
  });

  QUnit.module('Backbone.Reactive - Guardrail Tests', {
    beforeEach: function() {
      Backbone.Reactive.ReactiveContext.active = null;
    }
  });

  QUnit.test('computed cache is per-model, not shared', function(assert) {
    assert.expect(4);

    var Model = Backbone.Model.extend({
      reactive: true,
      computed: {
        doubled: function() {
          return this.get('value') * 2;
        }
      }
    });

    var model1 = new Model({value: 5});
    var model2 = new Model({value: 10});
    var proxy1 = Backbone.Reactive.wrap(model1);
    var proxy2 = Backbone.Reactive.wrap(model2);

    assert.equal(proxy1.get('doubled'), 10, 'model1 computed correct');
    assert.equal(proxy2.get('doubled'), 20, 'model2 computed correct');

    model1.set('value', 100);

    assert.equal(proxy1.get('doubled'), 200, 'model1 updated');
    assert.equal(proxy2.get('doubled'), 20, 'model2 unchanged (cache not shared)');
  });

  QUnit.test('wrapping twice does not double-bind listeners', function(assert) {
    assert.expect(3);

    var model = new Backbone.Model({count: 0});
    var proxy1 = Backbone.Reactive.wrap(model);
    var proxy2 = Backbone.Reactive.wrap(model);
    var runCount = 0;

    assert.equal(proxy1, proxy2, 'wrap returns same proxy on second call');

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      proxy1.get('count');
    });

    assert.equal(runCount, 1, 'runs once initially');

    model.set('count', 1);

    assert.equal(runCount, 2, 'runs once on change (not twice from double binding)');

    dispose();
  });

  QUnit.test('disposed autorun releases all listeners', function(assert) {
    assert.expect(3);

    var model = new Backbone.Model({value: 0});
    var proxy = Backbone.Reactive.wrap(model);
    var runCount = 0;

    var dispose = Backbone.Reactive.autorun(function() {
      runCount++;
      proxy.get('value');
    });

    assert.equal(runCount, 1, 'runs once initially');

    dispose();

    model.set('value', 1);
    assert.equal(runCount, 1, 'does not run after disposal (outside batch)');

    Backbone.Reactive.batch(function() {
      model.set('value', 2);
    });
    assert.equal(runCount, 1, 'does not run after disposal (inside batch)');
  });

})(QUnit);
