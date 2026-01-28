# Backbone + Backbone.Reactive Guide

This guide teaches you how to use Backbone.js with Backbone.Reactive, a reactive programming system that adds computed properties and auto-updating views to Backbone.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Backbone Concepts](#core-backbone-concepts)
3. [Backbone.Reactive System](#backbone-reactive-system)
4. [Computed Properties](#computed-properties)
5. [Reactive Views](#reactive-views)
6. [Autoruns](#autoruns)
7. [Batching Updates](#batching-updates)
8. [Common Patterns](#common-patterns)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

Backbone.Reactive consists of **three layers** that work together:

### Layer 1: Backbone.js (Core)
**File:** `backbone.js`
- Provides: Model, Collection, View, Events, Router, sync
- Unchanged - standard Backbone API
- No knowledge of reactivity

### Layer 2: Backbone.Reactive (Reactive Core)
**File:** `backbone.reactive.js` (~850 lines)
- Pure reactive system with NO Backbone dependencies
- Wraps models/collections in ES6 Proxy for dependency tracking
- Provides: ReactiveContext, DependencyGraph, UpdateScheduler
- Main API: `Backbone.Reactive.wrap()`, `autorun()`, `batch()`

### Layer 3: Backbone.Reactive Integration
**File:** `backbone.reactive.integration.js` (~250 lines)
- Hooks into Backbone to auto-enable reactivity
- Monkeypatches `Model.extend()`, `Collection.extend()`, `View.extend()`
- Enables `reactive: true` flag on models/collections/views
- Auto-wraps models in proxy, sets up view auto-updates

**Loading Order (Required):**
```html
<script src="backbone.js"></script>
<script src="backbone.reactive.js"></script>
<script src="backbone.reactive.integration.js"></script>
```

---

## Core Backbone Concepts

### Models
Models hold data and business logic. Use `get()`/`set()` to access attributes.

```javascript
var User = Backbone.Model.extend({
  defaults: {
    name: '',
    email: ''
  }
});

var user = new User({ name: 'Jane', email: 'jane@example.com' });
user.get('name');        // 'Jane'
user.set('name', 'John'); // Fires 'change:name' event
```

### Collections
Collections are ordered sets of models.

```javascript
var Users = Backbone.Collection.extend({
  model: User
});

var users = new Users([
  { name: 'Alice' },
  { name: 'Bob' }
]);

users.length;          // 2
users.at(0).get('name'); // 'Alice'
users.add({ name: 'Charlie' }); // Fires 'add' event
```

### Views
Views render UI and handle user input. Traditional Backbone requires manual event binding.

```javascript
// Traditional Backbone (manual binding)
var UserView = Backbone.View.extend({
  initialize: function() {
    this.listenTo(this.model, 'change', this.render); // Manual!
  },
  render: function() {
    this.el.innerHTML = this.model.get('name');
    return this;
  }
});
```

### Events
Backbone has a powerful event system. Models fire `change:attr` events, collections fire `add/remove/reset`.

```javascript
model.on('change:name', function() {
  console.log('Name changed!');
});
```

---

## Backbone.Reactive System

Backbone.Reactive eliminates manual event binding by automatically tracking dependencies.

### Enabling Reactivity

Add `reactive: true` to models, collections, or views:

```javascript
var User = Backbone.Model.extend({
  reactive: true,  // ← Enables reactivity
  defaults: {
    firstName: '',
    lastName: ''
  }
});
```

**What happens:**
1. Integration layer intercepts `Model.extend()`
2. Wraps `initialize()` to call `Backbone.Reactive.wrap(this)`
3. Creates an ES6 Proxy that tracks all `get()` calls
4. Sets up automatic cache invalidation on `set()`

### How Proxy Tracking Works

```javascript
var user = new User({ name: 'Jane' });
// → user._reactiveProxy created automatically

// When you access a property:
var proxy = user._reactiveProxy;
proxy.get('name');
// 1. Proxy's get trap intercepts
// 2. If ReactiveContext.active exists, track dependency
// 3. Return actual value from underlying model
```

**Key Point:** Dependency tracking only happens when there's an active `ReactiveContext` (inside a computed property, view render, or autorun).

---

## Computed Properties

Computed properties are **cached, dependency-driven** properties that automatically recompute when dependencies change.

### Basic Computed Property

```javascript
var User = Backbone.Model.extend({
  reactive: true,
  computed: {
    fullName: function() {
      // Accessing firstName and lastName establishes dependencies
      return this.get('firstName') + ' ' + this.get('lastName');
    }
  }
});

var user = new User({ firstName: 'Jane', lastName: 'Doe' });
user.get('fullName'); // 'Jane Doe' (computed and cached)
user.set('firstName', 'John');
user.get('fullName'); // 'John Doe' (cache invalidated, recomputed)
```

### How Computed Properties Work

1. **First access:** `user.get('fullName')`
   - Creates a `ReactiveContext`
   - Runs the computed function inside the context
   - Tracks all `get()` calls (firstName, lastName)
   - Caches result in WeakMap (per-model instance)
   - Sets up invalidation listeners

2. **Dependency changes:** `user.set('firstName', 'John')`
   - Backbone fires `change:firstName` event
   - Reactive system invalidates `fullName` cache
   - Removes old listeners

3. **Next access:** `user.get('fullName')`
   - Cache is invalid, recomputes
   - Re-tracks dependencies (may be different due to conditionals)
   - Caches new result

### Nested Computed Properties

Computed properties can depend on other computed properties:

```javascript
var User = Backbone.Model.extend({
  reactive: true,
  computed: {
    fullName: function() {
      return this.get('firstName') + ' ' + this.get('lastName');
    },
    displayName: function() {
      // Depends on computed property fullName
      return this.get('fullName') + ' (' + this.get('email') + ')';
    }
  }
});
```

**Transitive invalidation:** Changing `firstName` invalidates both `fullName` AND `displayName`.

### Conditional Dependencies

Dependencies are tracked **at runtime**, so conditional logic changes the dependency set:

```javascript
computed: {
  status: function() {
    if (this.get('isAdmin')) {
      return 'Admin: ' + this.get('role');
    } else {
      return 'User: ' + this.get('level');
    }
  }
}

// If isAdmin = true, depends on: isAdmin, role
// If isAdmin = false, depends on: isAdmin, level
```

### Collection Computed Properties

Collections can have computed properties too:

```javascript
var TodoList = Backbone.Collection.extend({
  reactive: true,
  computed: {
    activeCount: function() {
      return this.filter(function(todo) {
        return !todo.get('completed');
      }).length;
    }
  }
});

var todos = new TodoList([...]);
var proxy = Backbone.Reactive.wrap(todos);
proxy.get('activeCount'); // Computes count
todos.at(0).set('completed', true);
proxy.get('activeCount'); // Recomputes (child model changed)
```

**Collection computed invalidation:**
- Structural changes: `add`, `remove`, `reset` events
- Child model changes: any child's `change` event (blanket invalidation)

---

## Reactive Views

Views with `reactive: true` automatically re-render when accessed model/collection properties change.

### Basic Reactive View

```javascript
var UserView = Backbone.View.extend({
  reactive: true,  // ← No manual event binding needed!

  render: function() {
    // Access properties - automatically tracked
    var name = this.model.get('name');
    var email = this.model.get('email');

    this.el.innerHTML = '<div>' + name + ' (' + email + ')</div>';
    return this;
  }
});

var view = new UserView({ model: user });
view.render();
// → View automatically re-renders when name or email changes
```

### How Reactive Views Work

1. **Integration intercepts render():**
   - Creates `ReactiveContext` for the view
   - Swaps `this.model` with reactive proxy temporarily
   - Runs original `render()` inside context
   - Tracks all `get()` calls
   - Restores original model

2. **Sets up listeners:**
   - For each tracked property (e.g., `name`, `email`)
   - Listens to `change:name`, `change:email`
   - Schedules re-render via `UpdateScheduler`

3. **On change:**
   - Model fires `change:name` event
   - Listener triggers `UpdateScheduler.scheduleUpdate(view)`
   - Scheduler batches updates and uses RAF
   - View re-renders, re-tracks dependencies (may change)

### Conditional Rendering

Views re-track dependencies on every render:

```javascript
render: function() {
  if (this.model.get('isAdmin')) {
    this.el.innerHTML = 'Admin: ' + this.model.get('role');
  } else {
    this.el.innerHTML = 'User: ' + this.model.get('level');
  }
  return this;
}

// First render: isAdmin = true → tracks: isAdmin, role
// After toggle: isAdmin = false → tracks: isAdmin, level
```

### Collection Views

Views can track collection changes:

```javascript
var TodoListView = Backbone.View.extend({
  reactive: true,

  render: function() {
    var html = '';
    // Accessing this.collection.models tracks collection
    this.collection.models.forEach(function(todo) {
      html += '<div>' + todo.get('title') + '</div>';
    });
    this.el.innerHTML = html;
    return this;
  }
});

// Re-renders when collection.add(), .remove(), or child model changes
```

### View Cleanup

Call `view.remove()` to clean up:

```javascript
view.remove();
// → Stops listening to all reactive dependencies
// → Removes element from DOM
// → View never re-renders again
```

**Invariant:** After `remove()`, the view is silent. No more renders, even if dependencies change.

---

## Autoruns

Autoruns are functions that **automatically re-execute** when their dependencies change.

### Basic Autorun

```javascript
var model = new Backbone.Model({ count: 0 });
var proxy = Backbone.Reactive.wrap(model);

var dispose = Backbone.Reactive.autorun(function() {
  console.log('Count is:', proxy.get('count'));
});
// → Logs: "Count is: 0" (runs immediately)

proxy.set('count', 1);
// → Logs: "Count is: 1" (runs again)

dispose(); // Stop tracking
proxy.set('count', 2); // No log (disposed)
```

### Autorun Lifecycle

1. **Creation:** Runs immediately to establish dependencies
2. **Change:** Re-runs when any dependency changes
3. **Disposal:** Call returned `dispose()` to stop

### Non-Reentrant

Autoruns prevent synchronous re-entry:

```javascript
Backbone.Reactive.autorun(function() {
  var current = proxy.get('count');
  if (current < 5) {
    proxy.set('count', current + 1); // Won't cause immediate re-run
  }
});
// → Runs multiple times, but asynchronously (never re-enters itself)
```

**Invariant:** If an autorun writes to a property it also reads, it will NOT synchronously re-enter. Re-execution is deferred.

### Deduplication

Multiple changes in a batch result in one autorun execution:

```javascript
Backbone.Reactive.batch(function() {
  proxy.set('count', 1);
  proxy.set('count', 2);
  proxy.set('count', 3);
});
// → Autorun runs ONCE with count = 3
```

---

## Batching Updates

Use `batch()` to defer reactive updates until a block of changes completes.

### Basic Batching

```javascript
Backbone.Reactive.batch(function() {
  model.set('firstName', 'John');
  model.set('lastName', 'Doe');
  model.set('email', 'john@example.com');
});
// → View re-renders ONCE after all changes
// → Autoruns run ONCE after all changes
```

### How Batching Works

1. **Entering batch:** Increments `batchDepth` counter
2. **During batch:**
   - Backbone events fire synchronously (unchanged)
   - Reactive effects (view renders, autoruns) are queued
3. **Exiting batch:** Decrements `batchDepth`
   - If `batchDepth === 0` (outermost), flush queue
   - Executes all pending effects (deduplicated)

### Nested Batches

```javascript
Backbone.Reactive.batch(function() {
  model.set('a', 1); // depth = 1

  Backbone.Reactive.batch(function() {
    model.set('b', 2); // depth = 2
  }); // depth = 1, no flush yet

  model.set('c', 3); // depth = 1
}); // depth = 0, flush now
// → All effects run once at the end
```

**Invariant:** Effects flush only when the **outermost** batch exits.

### RAF Cancellation

If a view update was scheduled via `requestAnimationFrame` before entering a batch, the batch flush cancels that RAF to prevent double rendering.

---

## Common Patterns

### Pattern 1: Simple Reactive Model

```javascript
var Todo = Backbone.Model.extend({
  reactive: true,
  defaults: {
    title: '',
    completed: false
  },
  computed: {
    displayText: function() {
      var text = this.get('title');
      return this.get('completed') ? '✓ ' + text : text;
    }
  }
});
```

### Pattern 2: Collection with Counts

```javascript
var TodoList = Backbone.Collection.extend({
  reactive: true,
  model: Todo,
  computed: {
    activeCount: function() {
      return this.filter(function(t) { return !t.get('completed'); }).length;
    },
    completedCount: function() {
      return this.filter(function(t) { return t.get('completed'); }).length;
    }
  }
});
```

### Pattern 3: Simple Reactive View

```javascript
var TodoItemView = Backbone.View.extend({
  reactive: true,
  tagName: 'div',
  events: {
    'click .toggle': 'toggleComplete'
  },
  render: function() {
    var displayText = this.model.get('displayText'); // Tracks dependency
    this.el.innerHTML = '<span>' + displayText + '</span>' +
                        '<button class="toggle">Toggle</button>';
    this.delegateEvents(); // Re-bind after innerHTML
    return this;
  },
  toggleComplete: function() {
    this.model.set('completed', !this.model.get('completed'));
    // View auto-updates!
  }
});
```

### Pattern 4: Parent-Child View Reattachment

When a parent view re-renders and uses `innerHTML`, child views must be reattached:

```javascript
var ParentView = Backbone.View.extend({
  reactive: true,
  render: function() {
    // Clean up old child views
    this.childViews = this.childViews || [];
    this.childViews.forEach(function(v) { v.remove(); });
    this.childViews = [];

    // Build HTML
    var html = '<div class="items">';
    this.collection.models.forEach(function(model) {
      var child = new ChildView({ model: model });
      html += child.render().el.outerHTML;
      this.childViews.push(child);
    }.bind(this));
    html += '</div>';

    this.el.innerHTML = html;

    // Reattach child views to DOM elements
    var itemEls = this.el.querySelectorAll('.item');
    this.childViews.forEach(function(child, i) {
      child.setElement(itemEls[i]);
      child.delegateEvents();
    });

    return this;
  }
});
```

### Pattern 5: Form View (Non-Reactive)

Form views typically don't need reactivity:

```javascript
var FormView = Backbone.View.extend({
  reactive: false, // Forms don't need auto-updates
  events: {
    'submit form': 'handleSubmit'
  },
  handleSubmit: function(e) {
    e.preventDefault();
    var data = { title: this.$('input').val() };
    this.collection.add(data);
    this.$('input').val(''); // Clear input
  }
});
```

### Pattern 6: Autorun for Side Effects

```javascript
// Log whenever active count changes
var dispose = Backbone.Reactive.autorun(function() {
  var count = collection.get('activeCount');
  console.log('Active todos:', count);
  document.title = 'Todos (' + count + ')'; // Update page title
});

// Clean up later
dispose();
```

---

## Best Practices

### 1. Use `reactive: true` Selectively

**Opt-in, not global:**
```javascript
// Good: Only models that need computed properties
var User = Backbone.Model.extend({ reactive: true, computed: {...} });

// Good: Only views that need auto-updates
var UserView = Backbone.View.extend({ reactive: true, render: {...} });

// Good: Forms don't need reactivity
var FormView = Backbone.View.extend({ reactive: false });
```

### 2. Access Properties Through Proxy in Computed

```javascript
// Good: Uses 'this' (automatically the proxy)
computed: {
  fullName: function() {
    return this.get('firstName') + ' ' + this.get('lastName');
  }
}

// Bad: Accessing underlying model bypasses tracking
computed: {
  fullName: function() {
    return this.attributes.firstName + ' ' + this.attributes.lastName; // NO!
  }
}
```

### 3. Keep Computed Properties Pure

```javascript
// Good: Pure function
computed: {
  total: function() {
    return this.get('price') * this.get('quantity');
  }
}

// Bad: Side effects in computed
computed: {
  total: function() {
    console.log('Computing total'); // NO! Side effect
    this.trigger('computed'); // NO! Mutation
    return this.get('price') * this.get('quantity');
  }
}
```

### 4. Use `delegateEvents()` After `innerHTML`

```javascript
render: function() {
  this.el.innerHTML = '<button class="btn">Click</button>';
  this.delegateEvents(); // Re-bind event handlers
  return this;
}
```

### 5. Clean Up Views

```javascript
// Always call remove() when done with a view
view.remove();
// Stops reactive tracking, removes listeners, removes from DOM
```

### 6. Batch Multiple Changes

```javascript
// Good: Batched
Backbone.Reactive.batch(function() {
  todos.add([todo1, todo2, todo3]);
  todos.at(0).set('completed', true);
});

// Bad: Triggers 4 separate re-renders
todos.add(todo1);
todos.add(todo2);
todos.add(todo3);
todos.at(0).set('completed', true);
```

### 7. Avoid Circular Dependencies

```javascript
// Bad: Circular dependency
computed: {
  a: function() { return this.get('b') + 1; },
  b: function() { return this.get('a') + 1; }
}
// → Throws: "Circular dependency detected"
```

### 8. Test Reactive Patterns

Write tests that verify reactive updates work:

```javascript
QUnit.test('view updates on model change', function(assert) {
  var done = assert.async();
  var model = new Model({ name: 'Test' });
  var view = new View({ model: model });
  view.render();

  model.set('name', 'Updated');

  setTimeout(function() {
    assert.equal(view.el.textContent, 'Updated');
    done();
  }, 50);
});
```

---

## Troubleshooting

### Problem: Computed property not updating

**Cause:** Not accessing properties via `get()`

```javascript
// Bad: Direct attribute access (no tracking)
computed: {
  fullName: function() {
    return this.attributes.firstName + ' ' + this.attributes.lastName;
  }
}

// Good: Use get()
computed: {
  fullName: function() {
    return this.get('firstName') + ' ' + this.get('lastName');
  }
}
```

### Problem: View not re-rendering

**Possible causes:**

1. **View not reactive:**
   ```javascript
   // Add reactive: true
   var MyView = Backbone.View.extend({ reactive: true, ... });
   ```

2. **Not accessing properties in render:**
   ```javascript
   // Bad: Setting from external source
   render: function() {
     this.el.innerHTML = someGlobalVariable; // No tracking!
   }

   // Good: Access model/collection
   render: function() {
     this.el.innerHTML = this.model.get('name'); // Tracked!
   }
   ```

3. **View not attached to DOM:**
   ```javascript
   // Views must have el.parentNode (be in DOM) to render
   document.body.appendChild(view.el); // Attach first
   view.render();
   ```

### Problem: Form submission breaks after re-render

**Cause:** Form view recreated or events not re-bound

**Solution:** Reattach and delegate events:

```javascript
// After parent re-renders
var formEl = this.el.querySelector('.form-container');
this.formView.setElement(formEl);
this.formView.delegateEvents();
```

### Problem: Stack overflow or infinite loop

**Causes:**

1. **Circular computed dependencies:**
   ```javascript
   // Don't do this
   computed: {
     a: function() { return this.get('b'); },
     b: function() { return this.get('a'); }
   }
   ```

2. **Writing to read dependency in autorun:**
   ```javascript
   // This is OK (non-reentrant), but avoid if possible
   autorun(function() {
     var val = proxy.get('count');
     proxy.set('count', val + 1); // Deferred, not immediate
   });
   ```

### Problem: Test timing issues

**Solution:** Use async tests with timeouts for reactive updates:

```javascript
QUnit.test('reactive test', function(assert) {
  var done = assert.async();

  // Make changes
  model.set('value', 123);

  // Wait for reactive system to flush (RAF + batch)
  setTimeout(function() {
    assert.equal(view.el.textContent, '123');
    done();
  }, 50);
});
```

---

## Key Files Reference

**Core Implementation:**
- `backbone.js` - Standard Backbone (models, collections, views)
- `backbone.reactive.js` - Reactive core (proxy, tracking, scheduler)
- `backbone.reactive.integration.js` - Backbone integration hooks

**Tests:**
- `test/reactive.js` - Comprehensive reactive test suite
- `test/reactive-example-integration.js` - Example integration tests
- `tests/qunit.spec.js` - Playwright tests

**Examples:**
- `examples/reactive-todo/` - Complete working example

**Documentation:**
- `README.md` - Behavioral invariants (lines 44-162)
- `REACTIVE_QUICKSTART.md` - Quick start guide

---

## Behavioral Invariants

These behaviors are **guaranteed** and tested (see README.md lines 44-162):

### Computed Properties
1. Cached per-model instance (WeakMap)
2. Invalidated only when accessed dependencies change
3. Transitive invalidation through dependency graph
4. Single recomputation per invalidation
5. Runtime dependency tracking (conditional branches)

### Autoruns
1. Non-reentrant (no synchronous self-calls)
2. Deduplicated during batch
3. Disposal stops all tracking
4. Initial execution on creation
5. Re-track dependencies on every execution

### Batching
1. Outermost-only flush (nested batches don't flush)
2. Batches reactive effects, NOT Backbone events
3. Synchronous function execution
4. RAF cancellation for pending view updates

### Views
1. Track only accessed properties
2. Re-track dependencies on every render
3. Silent after remove()
4. Batch-aware rendering
5. Must be attached to DOM (el.parentNode)

---

## Summary

**Backbone.Reactive** adds reactive programming to Backbone.js:

- **Computed properties:** Cached, dependency-driven derived data
- **Reactive views:** Auto-updating views without manual event binding
- **Autoruns:** Functions that re-run when dependencies change
- **Batching:** Defer updates until multiple changes complete

**Key Principles:**
1. Opt-in with `reactive: true`
2. ES6 Proxy tracks `get()` calls automatically
3. Dependency tracking is runtime and conditional
4. Updates are batched and deduplicated
5. Integration is transparent - Backbone API unchanged

**When to use:**
- Models with derived data → computed properties
- Views that auto-update → reactive views
- Side effects on change → autoruns
- Multiple changes → batch()

For working examples, see `examples/reactive-todo/`.
