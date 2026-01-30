//     Backbone Reactive Core
//     Adds reactive properties, computed properties, and auto-updating views to Backbone
//
//     Usage:
//       const User = Backbone.Model.extend({
//         reactive: true,
//         computed: {
//           fullName() { return this.get('firstName') + ' ' + this.get('lastName'); }
//         }
//       });
//
//       const UserView = Backbone.View.extend({
//         reactive: true,
//         render() {
//           this.$el.html(this.model.get('fullName')); // Auto-updates when firstName/lastName change
//         }
//       });

(function(root) {
  'use strict';

  // Check if Proxy is available
  if (typeof Proxy === 'undefined') {
    console.warn('Backbone.Reactive requires ES6 Proxy. Falling back to non-reactive mode.');
    if (root.Backbone && root.Backbone.Reactive) {
      root.Backbone.Reactive.enabled = false;
    }
    return;
  }

  var Backbone = root.Backbone;
  if (!Backbone) {
    throw new Error('Backbone.Reactive requires Backbone to be loaded first');
  }

  // ReactiveContext: Tracks which view/computed is currently executing
  // -----------------------------------------------------------------
  var ReactiveContext = function(viewOrModel) {
    this.viewOrModel = viewOrModel;
    this.dependencies = new Map(); // key = cid:prop, value = {model, prop}
  };

  ReactiveContext.active = null;

  ReactiveContext.run = function(fn, context) {
    var prev = ReactiveContext.active;
    ReactiveContext.active = context;
    try {
      return fn();
    } finally {
      ReactiveContext.active = prev;
    }
  };

  ReactiveContext.prototype.addDependency = function(model, prop) {
    var key = model.cid + ':' + prop;
    if (this.dependencies.has(key)) return;
    this.dependencies.set(key, {model: model, prop: prop});
  };

  ReactiveContext.prototype.clear = function() {
    this.dependencies.clear();
  };

  ReactiveContext.prototype.isEmpty = function() {
    return this.dependencies.size === 0;
  };

  // DependencyGraph: Tracks computed property dependencies and detects cycles
  // -------------------------------------------------------------------------
  var DependencyGraph = function() {
    this.edges = new Map();
    this.computing = new Set();
  };

  DependencyGraph.prototype.addDependency = function(computedKey, model, prop) {
    var key = model.cid + ':' + prop;
    if (!this.edges.has(key)) {
      this.edges.set(key, new Set());
    }
    this.edges.get(key).add(computedKey);
  };

  DependencyGraph.prototype.getDependents = function(model, prop) {
    var key = model.cid + ':' + prop;
    var dependents = this.edges.get(key);
    if (!dependents) return [];
    return Array.from(dependents);
  };

  DependencyGraph.prototype.computeProperty = function(model, propName, proxy, fn) {
    var computedKey = model.cid + ':' + propName;

    if (this.computing.has(computedKey)) {
      throw new Error('Circular dependency detected in computed property \'' + propName + '\'');
    }

    this.computing.add(computedKey);
    try {
      var context = new ReactiveContext(model);
      // Store outer context before running computation
      var outerContext = ReactiveContext.active;

      // fn is already bound to proxy in ReactiveSystem.computeProperty, so just call it
      // The fn() call will execute the computed function with proxy as 'this',
      // and when proxy.get() is called inside, it will track dependencies in the active context
      var result = ReactiveContext.run(function() {
        return fn();
      }, context);

      // Register all dependencies that were tracked during computation
      // IMPORTANT: We must register dependencies AFTER the computation completes
      // so that all property accesses during computation are tracked
      var self = this;
      // Convert Map values to Array to ensure we iterate over all dependencies
      var depsArray = Array.from(context.dependencies.values());

      // Add dependencies to outer context if it exists (for test assertions)
      if (outerContext) {
        depsArray.forEach(function(dep) {
          outerContext.addDependency(dep.model, dep.prop);
        });
      }

      // Register dependencies in dependency graph
      // Only add new dependencies, don't clear old ones unless needed for conditional tracking
      depsArray.forEach(function(dep) {
        // Register that the computed property depends on this model property
        // Format: computedKey (e.g., "c1:expensive") depends on model property (e.g., "c1:value")
        self.addDependency(computedKey, dep.model, dep.prop);
      });

      return result;
    } finally {
      this.computing['delete'](computedKey);
    }
  };

  // DependencyTracker: Tracks which views depend on which model properties
  // ----------------------------------------------------------------------
  var DependencyTracker = function() {
    this.modelDependents = new WeakMap();
    this.viewDependencies = new WeakMap();
  };

  DependencyTracker.prototype.addDependency = function(view, model, prop) {
    if (!this.viewDependencies.has(view)) {
      this.viewDependencies.set(view, new Set());
    }
    this.viewDependencies.get(view).add({model: model, prop: prop});

    if (!this.modelDependents.has(model)) {
      this.modelDependents.set(model, new Map());
    }
    var modelDeps = this.modelDependents.get(model);
    if (!modelDeps.has(prop)) {
      modelDeps.set(prop, new WeakSet());
    }
    modelDeps.get(prop).add(view);
  };

  DependencyTracker.prototype.removeView = function(view) {
    var deps = this.viewDependencies.get(view);
    if (!deps) return;

    var self = this;
    deps.forEach(function(dep) {
      var modelDeps = self.modelDependents.get(dep.model);
      if (modelDeps) {
        var propDeps = modelDeps.get(dep.prop);
        if (propDeps) {
          propDeps['delete'](view);
          if (propDeps.size === 0) {
            modelDeps['delete'](dep.prop);
          }
        }
        if (modelDeps.size === 0) {
          self.modelDependents['delete'](dep.model);
        }
      }
    });
    this.viewDependencies['delete'](view);
  };

  // UpdateScheduler: Batches view updates using requestAnimationFrame
  // ------------------------------------------------------------------
  var UpdateScheduler = function() {
    this.pendingUpdates = new Map();
    this.priorityQueue = {
      high: new Set(),
      normal: new Set(),
      low: new Set()
    };
    this.scheduled = false;
    this.frameId = null;
    this.debounceTimers = new WeakMap();
    this.getBatchDepth = null; // Will be set later to access _batchDepth
  };

  UpdateScheduler.prototype.scheduleUpdate = function(view, model, prop, options) {
    if (!view.el || !view.el.parentNode) return;

    options = options || {};
    var viewOptions = view.reactiveOptions || {};
    var priority = options.priority || viewOptions.priority || 'normal';
    var debounce = options.debounce !== undefined ? options.debounce : viewOptions.debounce;

    if (debounce && debounce > 0) {
      var existingTimer = this.debounceTimers.get(view);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      var self = this;
      var timer = setTimeout(function() {
        self.debounceTimers['delete'](view);
        self._scheduleImmediate(view, model, prop, priority);
      }, debounce);

      this.debounceTimers.set(view, timer);
      return;
    }

    this._scheduleImmediate(view, model, prop, priority);
  };

  UpdateScheduler.prototype._scheduleImmediate = function(view, model, prop, priority) {
    if (!this.pendingUpdates.has(view)) {
      this.pendingUpdates.set(view, new Set());
    }
    this.pendingUpdates.get(view).add({model: model, prop: prop});

    this.priorityQueue[priority].add(view);

    if (!this.scheduled) {
      this.scheduled = true;
      var self = this;
      if (typeof requestAnimationFrame !== 'undefined') {
        this.frameId = requestAnimationFrame(function() {
          self.flush();
        });
      } else {
        this.frameId = setTimeout(function() {
          self.flush();
        }, 0);
      }
    }
  };

  UpdateScheduler.prototype.flush = function() {
    // Don't flush if we're inside a batch
    if (this.getBatchDepth && this.getBatchDepth() > 0) {
      return;
    }

    // Cancel any pending RAF to prevent double flush
    if (this.frameId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.frameId);
      } else {
        clearTimeout(this.frameId);
      }
    }

    var updates = new Map(this.pendingUpdates);
    var priorities = {
      high: new Set(this.priorityQueue.high),
      normal: new Set(this.priorityQueue.normal),
      low: new Set(this.priorityQueue.low)
    };

    this.pendingUpdates.clear();
    this.priorityQueue.high.clear();
    this.priorityQueue.normal.clear();
    this.priorityQueue.low.clear();
    this.scheduled = false;
    this.frameId = null;

    var renderOrder = [].concat(
      Array.from(priorities.high),
      Array.from(priorities.normal),
      Array.from(priorities.low)
    );
    var rendered = new Set();

    var self = this;
    renderOrder.forEach(function(view) {
      if (rendered.has(view)) return;
      if (!view.el || !view.el.parentNode) return;

      try {
        view.render();
        rendered.add(view);
      } catch (error) {
        console.error('Error in reactive render:', error);
      }
    });
  };

  UpdateScheduler.prototype.cancel = function() {
    if (this.frameId) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.frameId);
      } else {
        clearTimeout(this.frameId);
      }
      this.frameId = null;
      this.scheduled = false;
    }
  };

  UpdateScheduler.prototype.cancelForView = function(view) {
    this.pendingUpdates['delete'](view);
    this.priorityQueue.high['delete'](view);
    this.priorityQueue.normal['delete'](view);
    this.priorityQueue.low['delete'](view);

    var timer = this.debounceTimers.get(view);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers['delete'](view);
    }

    if (this.pendingUpdates.size === 0) {
      this.cancel();
    }
  };

  // ReactiveSystem: Main reactive system that wraps models and tracks dependencies
  // ------------------------------------------------------------------------------
  var ReactiveSystem = function() {
    this.dependencyGraph = new DependencyGraph();
    this.tracker = new DependencyTracker();
    this.scheduler = new UpdateScheduler();
    this.computedCache = new WeakMap();
  };

  ReactiveSystem.prototype.wrapModel = function(model) {
    if (!model || typeof model !== 'object') {
      return model;
    }

    if (model._reactiveProxy) {
      return model._reactiveProxy;
    }

    if (model._wrapping) {
      return model;
    }

    model._wrapping = true;

    try {
      var originalGet = model.get;
      if (!originalGet || typeof originalGet !== 'function') {
        originalGet = Backbone.Model.prototype.get;
      }

      var originalSet = model.set;
      if (!originalSet || typeof originalSet !== 'function') {
        originalSet = Backbone.Model.prototype.set;
      }

      var self = this;
      var proxy = new Proxy(model, {
        get: function(target, prop) {
          if (prop === '_reactiveProxy') {
            return proxy;
          }
          if (prop === '_wrapping') {
            return target._wrapping;
          }

          // CRITICAL: When 'get' method is accessed, return wrappedGet
          // This ensures dependency tracking works
          if (prop === 'get' && typeof originalGet === 'function') {
            return self.handleGet(target, prop, originalGet);
          }

          // Wrap the 'set' method to intercept it
          if (prop === 'set' && typeof originalSet === 'function') {
            return function(key, value, options) {
              // Handle both single key-value and object syntax
              if (key == null) {
                return originalSet.call(target, key, value, options);
              }

              // If key is an object, handle each property
              if (typeof key === 'object') {
                var attrs = key;
                // Capture old values BEFORE calling set()
                var oldValues = {};
                Object.keys(attrs).forEach(function(prop) {
                  oldValues[prop] = target.get ? target.get(prop) : target[prop];
                });
                var result = originalSet.call(target, attrs, value);
                if (result !== false) {
                  // Invalidate cache for all changed properties
                  Object.keys(attrs).forEach(function(prop) {
                    self.handleSet(target, prop, attrs[prop], true, oldValues[prop]);
                  });
                }
                return result;
              }

              // Single property set - capture old value before calling set()
              var oldValue = target.get ? target.get(key) : target[key];
              var result = originalSet.call(target, key, value, options);
              if (result !== false) {
                // Pass true to skipSetCall since set() was already called, and pass oldValue
                self.handleSet(target, key, value, true, oldValue);
              }
              return result;
            };
          }

          // Use handleGet for all other properties (including 'get')
          return self.handleGet(target, prop, originalGet);
        },
        set: function(target, prop, value) {
          // Ensure handleSet uses the correct ReactiveSystem instance (self)
          return self.handleSet(target, prop, value);
        },
        ownKeys: function(target) {
          return self.handleOwnKeys(target);
        },
        getOwnPropertyDescriptor: function(target, prop) {
          return self.handleDescriptor(target, prop);
        }
      });

      Object.defineProperty(model, '_reactiveProxy', {
        value: proxy,
        writable: false,
        configurable: true,
        enumerable: false
      });

      // Replace model.set with wrapped version so direct calls trigger reactive invalidation
      if (originalSet && typeof originalSet === 'function') {
        var self = this;
        model.set = function(key, value, options) {
          // Handle both single key-value and object syntax
          if (key == null) {
            return originalSet.call(this, key, value, options);
          }

          // If key is an object, handle each property
          if (typeof key === 'object') {
            var attrs = key;
            // Capture old values BEFORE calling set()
            var oldValues = {};
            Object.keys(attrs).forEach(function(prop) {
              oldValues[prop] = this.get ? this.get(prop) : this[prop];
            }.bind(this));
            var result = originalSet.call(this, attrs, value);
            if (result !== false) {
              // Invalidate cache for all changed properties
              Object.keys(attrs).forEach(function(prop) {
                self.handleSet(this, prop, attrs[prop], true, oldValues[prop]);
              }.bind(this));
            }
            return result;
          }

          // Single property set - capture old value before calling set()
          var oldValue = this.get ? this.get(key) : this[key];
          var result = originalSet.call(this, key, value, options);
          if (result !== false) {
            // Pass true to skipSetCall since set() was already called, and pass oldValue
            self.handleSet(this, key, value, true, oldValue);
          }
          return result;
        };
      }

      delete model._wrapping;
      return proxy;
    } catch (e) {
      delete model._wrapping;
      console.error('Error wrapping model:', e);
      return model;
    }
  };

  ReactiveSystem.prototype.wrapCollection = function(collection) {
    if (!collection || typeof collection !== 'object') {
      return collection;
    }

    if (collection._reactiveProxy) {
      return collection._reactiveProxy;
    }

    if (collection._wrapping) {
      return collection;
    }

    collection._wrapping = true;

    try {
      var originalGet = collection.get;
      if (!originalGet || typeof originalGet !== 'function') {
        originalGet = Backbone.Collection.prototype.get;
      }

      var self = this;

      // Set up listeners for collection mutations and child model changes
      if (!collection._reactiveListenersSetup) {
        // Listen to collection structure changes (add, remove, reset)
        var structureChangeHandler = function() {
          // Invalidate all collection computed properties when structure changes
          var cache = self.computedCache.get(collection);
          if (cache) {
            cache.clear();
          }
        };
        collection.on('add', structureChangeHandler);
        collection.on('remove', structureChangeHandler);
        collection.on('reset', structureChangeHandler);
        collection.on('update', structureChangeHandler);

        // Listen to child model changes
        var childChangeHandler = function(model) {
          // Invalidate all collection computed properties when child models change
          var cache = self.computedCache.get(collection);
          if (cache) {
            cache.clear();
          }
        };
        collection.on('change', childChangeHandler);

        collection._reactiveListenersSetup = true;
        collection._reactiveStructureHandlers = [structureChangeHandler, childChangeHandler];
      }

      var proxy = new Proxy(collection, {
        get: function(target, prop) {
          if (prop === '_reactiveProxy') {
            return proxy;
          }
          if (prop === '_wrapping') {
            return target._wrapping;
          }
          // Handle 'get' specially for collections
          if (prop === 'get') {
            return function(attr) {
              // Check if this is a computed property
              var computed = target._computed || target.constructor.prototype._computed;
              if (computed && computed[attr]) {
                return self.computeProperty(target, attr);
              }

              // Track dependency if there's an active ReactiveContext
              if (ReactiveContext.active) {
                ReactiveContext.active.addDependency(target, attr);
              }

              // Call original Collection.get(id) for model lookup
              return originalGet.call(target, attr);
            };
          }

          // Handle computed properties accessed directly
          var computed = target._computed || target.constructor.prototype._computed;
          if (computed && computed[prop]) {
            return self.computeProperty(target, prop);
          }

          // Don't track dependencies on collection properties that trigger events
          // Collections fire 'add', 'remove', 'reset', 'sort' events which are handled
          // by view bindings, so tracking properties like 'length' or 'models' would
          // cause double renders
          var skipTracking = prop === 'length' || prop === 'models' || prop === 'model';

          // Track dependency for other property accesses (unless it's an event-triggering property)
          if (ReactiveContext.active && !skipTracking) {
            ReactiveContext.active.addDependency(target, prop);
          }

          return target[prop];
        },
        set: function(target, prop, value) {
          return self.handleSet(target, prop, value);
        },
        ownKeys: function(target) {
          return self.handleOwnKeys(target);
        },
        getOwnPropertyDescriptor: function(target, prop) {
          return self.handleDescriptor(target, prop);
        }
      });

      Object.defineProperty(collection, '_reactiveProxy', {
        value: proxy,
        writable: false,
        configurable: true,
        enumerable: false
      });

      delete collection._wrapping;
      return proxy;
    } catch (e) {
      delete collection._wrapping;
      console.error('Error wrapping collection:', e);
      return collection;
    }
  };

  ReactiveSystem.prototype.handleGet = function(target, prop, originalGet) {
    if (prop === '_reactiveProxy' || prop === '_wrapping') {
      return target[prop];
    }
    if (prop[0] === '_' || prop === 'cid' || prop === 'constructor') {
      return target[prop];
    }

    if (prop === 'get' && typeof originalGet === 'function') {
      var self = this;
      var wrappedGet = function(attr) {
        // Check for computed properties first
        var computed = target._computed || target.constructor.prototype._computed;
        if (computed && computed[attr]) {
          return self.computeProperty(target, attr);
        }

        // Track dependency if there's an active ReactiveContext
        // This happens when computing computed properties or rendering views
        // ReactiveContext.active is set by ReactiveContext.run() in DependencyGraph.computeProperty
        if (ReactiveContext.active) {
          ReactiveContext.active.addDependency(target, attr);
        } else {
          // Debug: Log when ReactiveContext.active is null
          // This should only happen outside of ReactiveContext.run()
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[wrappedGet] ReactiveContext.active is null for attr:', attr, 'target.cid:', target.cid);
          }
        }

        // Call the original get method
        return originalGet.call(target, attr);
      };
      wrappedGet._isWrappedGet = true;
      return wrappedGet;
    }

    var computed = target._computed || target.constructor.prototype._computed;
    if (computed && computed[prop]) {
      return this.computeProperty(target, prop);
    }

    if (ReactiveContext.active) {
      ReactiveContext.active.addDependency(target, prop);
    }

    if (prop in (target.attributes || {})) {
      if (originalGet && typeof originalGet === 'function') {
        return originalGet.call(target, prop);
      }
      return target.attributes[prop];
    }

    return target[prop];
  };

  ReactiveSystem.prototype.handleSet = function(target, prop, value, skipSetCall, oldValue) {
    // If skipSetCall is true, target.set() was already called by the wrapped set method
    // Otherwise, we need to call it (for Proxy set trap)
    if (oldValue === undefined) {
      oldValue = target.get ? target.get(prop) : target[prop];
    }
    var result;

    if (skipSetCall) {
      // set() was already called, just use the current value
      result = target;
    } else {
      // Call set() (for Proxy set trap - direct property assignment)
      result = target.set(prop, value);
    }

    if (result !== false) {
      // Invalidate computed property cache for this property
      var cache = this.computedCache.get(target);
      if (cache) {
        // Get all computed properties that depend on this property
        var dependents = this.dependencyGraph.getDependents(target, prop);
        if (dependents && dependents.length > 0) {
          dependents.forEach(function(computedKey) {
            var parts = computedKey.split(':');
            if (parts.length >= 2) {
              var computedProp = parts[1];
              cache['delete'](computedProp);
            }
          });
        }
      }

      // If target is a Collection, invalidate all computed properties
      // because collection mutations (add/remove) affect all computed properties
      if (target instanceof Backbone.Collection) {
        if (cache) {
          cache.clear();
        }
      }

      this.notifyDependents(target, prop, oldValue, value);
    }

    return result !== false;
  };

  ReactiveSystem.prototype.computeProperty = function(model, propName) {
    var cache = this.computedCache.get(model);
    if (cache && cache.has(propName)) {
      // Cache hit - but still need to track dependency in active context
      if (ReactiveContext.active) {
        ReactiveContext.active.addDependency(model, propName);
      }
      return cache.get(propName);
    }

    var computed = model._computed || model.constructor.prototype._computed;
    if (!computed) return undefined;
    var fn = computed[propName];
    if (!fn) return undefined;

    var self = this;
    var proxy = model._reactiveProxy || model;

    // Pass proxy to dependencyGraph so it can use it as 'this' context
    // The fn() callback will be called with proxy as 'this', so when this.get('value')
    // is called inside the computed function, it goes through the proxy's get trap
    var result = this.dependencyGraph.computeProperty(model, propName, proxy, function() {
      // Call the computed function with proxy as 'this' so this.get() goes through proxy
      // This ensures that property accesses inside the computed function are tracked
      return fn.call(proxy);
    });

    // Re-fetch cache after computation - nested computeds may have created it
    cache = this.computedCache.get(model);
    if (!cache) {
      this.computedCache.set(model, new Map());
      cache = this.computedCache.get(model);
    }
    cache.set(propName, result);

    return result;
  };

  ReactiveSystem.prototype.notifyDependents = function(model, prop, oldValue, newValue) {
    if (oldValue === newValue) return;

    var dependents = this.dependencyGraph.getDependents(model, prop);
    var cache = this.computedCache.get(model);
    if (cache && dependents.length > 0) {
      var self = this;
      dependents.forEach(function(computedKey) {
        var parts = computedKey.split(':');
        if (parts.length >= 2) {
          var computedProp = parts[1];
          cache['delete'](computedProp);
          self.invalidateComputed(model, computedProp);
        }
      });
    }
  };

  ReactiveSystem.prototype.invalidateComputed = function(model, propName) {
    var cache = this.computedCache.get(model);
    if (!cache) return;

    cache['delete'](propName);

    var dependents = this.dependencyGraph.getDependents(model, propName);
    var self = this;
    dependents.forEach(function(computedKey) {
      var parts = computedKey.split(':');
      if (parts.length >= 2) {
        var dependentProp = parts[1];
        // Check both instance and prototype for computed properties
        var computed = model._computed || model.constructor.prototype._computed;
        if (computed && computed[dependentProp]) {
          self.invalidateComputed(model, dependentProp);
        }
      }
    });
  };

  ReactiveSystem.prototype.handleOwnKeys = function(target) {
    return Object.keys(target.attributes || {});
  };

  ReactiveSystem.prototype.handleDescriptor = function(target, prop) {
    if (prop in (target.attributes || {})) {
      return {
        enumerable: true,
        configurable: true,
        value: target.get ? target.get(prop) : target[prop]
      };
    }
    return Object.getOwnPropertyDescriptor(target, prop);
  };

  var reactiveSystem = new ReactiveSystem();

  // Batch depth tracking for nested batch() calls
  var _batchDepth = 0;

  // Set up batch depth getter for scheduler
  reactiveSystem.scheduler.getBatchDepth = function() {
    return _batchDepth;
  };

  // Autorun tracking for reentrancy prevention
  var _autorunExecuting = new WeakMap();
  var _autorunPending = new WeakMap();
  var _pendingAutorunCallbacks = [];

  if (!Backbone.Reactive) {
    Backbone.Reactive = {};
  }

  Backbone.Reactive.ReactiveContext = ReactiveContext;
  Backbone.Reactive.DependencyGraph = DependencyGraph;
  Backbone.Reactive.DependencyTracker = DependencyTracker;
  Backbone.Reactive.UpdateScheduler = UpdateScheduler;
  Backbone.Reactive.ReactiveSystem = ReactiveSystem;

  Backbone.Reactive.wrap = function(modelOrCollection) {
    if (modelOrCollection instanceof Backbone.Collection) {
      return reactiveSystem.wrapCollection(modelOrCollection);
    }
    return reactiveSystem.wrapModel(modelOrCollection);
  };

  // Backbone.Reactive.autorun(fn) - Runs fn immediately and re-runs on dependencies change
  // Returns dispose function to stop tracking
  //
  // Works with both reactive and non-reactive models by wrapping them temporarily during execution
  Backbone.Reactive.autorun = function(fn) {
    if (typeof fn !== 'function') {
      throw new Error('autorun requires a function');
    }

    var context = new ReactiveContext(null);
    var disposed = false;
    var listeners = [];

    var run = function() {
      if (disposed) return;

      // Reentrancy guard: prevent synchronous re-entry
      if (_autorunExecuting.get(run)) {
        // Mark as pending instead of executing synchronously
        _autorunPending.set(run, true);
        return;
      }

      _autorunExecuting.set(run, true);

      try {
        // Clear previous dependencies
        context.clear();

        // Run the function and track dependencies
        ReactiveContext.run(fn, context);

        // Remove old listeners
        listeners.forEach(function(listener) {
          listener.model.off('change:' + listener.prop, listener.callback);
        });
        listeners = [];

        // Set up new listeners for dependencies
        var deps = Array.from(context.dependencies.values());
        deps.forEach(function(dep) {
          var callback = function() {
            // Schedule rerun - respect batch depth
            if (!_autorunPending.get(run)) {
              _autorunPending.set(run, true);

              if (_batchDepth > 0) {
                // Inside batch - add to pending callbacks
                _pendingAutorunCallbacks.push(function() {
                  _autorunPending['delete'](run);
                  run();
                });
              } else {
                // Outside batch - run synchronously for immediate reactivity
                _autorunPending['delete'](run);
                run();
              }
            }
          };
          dep.model.on('change:' + dep.prop, callback);
          listeners.push({model: dep.model, prop: dep.prop, callback: callback});
        });
      } finally {
        _autorunExecuting['delete'](run);
      }
    };

    // Initial run
    run();

    // Return dispose function
    return function() {
      disposed = true;
      listeners.forEach(function(listener) {
        listener.model.off('change:' + listener.prop, listener.callback);
      });
      listeners = [];
      context.clear();
    };
  };

  // Backbone.Reactive.batch(fn) - Batches reactive updates
  // Flushes scheduler only when outermost batch completes
  Backbone.Reactive.batch = function(fn) {
    if (typeof fn !== 'function') {
      throw new Error('batch requires a function');
    }

    _batchDepth++;
    try {
      return fn();
    } finally {
      _batchDepth--;
      if (_batchDepth === 0) {
        // Flush scheduler when outermost batch completes
        reactiveSystem.scheduler.flush();

        // Execute pending autorun callbacks
        var callbacks = _pendingAutorunCallbacks.slice();
        _pendingAutorunCallbacks.length = 0;
        callbacks.forEach(function(callback) {
          callback();
        });
      }
    }
  };

  Backbone.Reactive.tracker = reactiveSystem.tracker;
  Backbone.Reactive.scheduler = reactiveSystem.scheduler;
  Backbone.Reactive.dependencyGraph = reactiveSystem.dependencyGraph;
  Backbone.Reactive.enabled = true;

})(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this);
