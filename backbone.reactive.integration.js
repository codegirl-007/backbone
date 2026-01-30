//     Backbone Reactive Integration
//     Integrates reactive system with Model and View
//
//     This file should be loaded after both backbone.js and backbone.reactive.js

(function(root) {
  'use strict';

  var Backbone = root.Backbone;
  if (!Backbone || !Backbone.Reactive || !Backbone.Reactive.enabled) {
    return; // Reactive system not available
  }

  var ReactiveContext = Backbone.Reactive.ReactiveContext;
  var reactiveSystem = Backbone.Reactive.tracker ? {
    tracker: Backbone.Reactive.tracker,
    scheduler: Backbone.Reactive.scheduler,
    wrap: Backbone.Reactive.wrap
  } : null;

  if (!reactiveSystem) {
    console.warn('Backbone.Reactive integration requires reactive system to be loaded');
    return;
  }

  var originalModelExtend = Backbone.Model.extend;
  var originalCollectionExtend = Backbone.Collection.extend;
  var originalViewExtend = Backbone.View.extend;
  var originalViewRender = Backbone.View.prototype.render;
  var originalViewRemove = Backbone.View.prototype.remove;
  var originalViewInitialize = Backbone.View.prototype.initialize;
  var originalViewSetElement = Backbone.View.prototype.setElement;

  Backbone.Model.extend = function(protoProps, staticProps) {
    var hasComputed = protoProps && protoProps.computed;
    var hasReactive = protoProps && (protoProps.reactive || Backbone.Model.reactive);

    if (hasComputed) {
      protoProps._computed = protoProps.computed;
      var computedInit = protoProps.initialize || function(){};
      protoProps.initialize = function() {
        try {
          this._computedCache = new Map();
        } catch (e) {
          console.error('Error creating computed cache:', e);
          this._computedCache = {};
        }
        return computedInit.apply(this, arguments);
      };
      delete protoProps.computed;
    }

    if (hasReactive) {
      var reactiveInit = protoProps.initialize || function(){};
      protoProps.initialize = function() {
        reactiveInit.apply(this, arguments);
        var reactiveWrap = typeof Backbone !== 'undefined' && Backbone.Reactive && Backbone.Reactive.wrap;
        if (this.reactive !== false && reactiveWrap && !this._reactiveProxy) {
          try {
            Backbone.Reactive.wrap(this);
          } catch (e) {
            console.error('Failed to wrap model:', e);
          }
        }
      };
    }

    return originalModelExtend.call(this, protoProps, staticProps);
  };

  Backbone.Collection.extend = function(protoProps, staticProps) {
    var hasComputed = protoProps && protoProps.computed;
    var hasReactive = protoProps && (protoProps.reactive || Backbone.Collection.reactive);

    if (hasComputed) {
      protoProps._computed = protoProps.computed;
      var computedInit = protoProps.initialize || function(){};
      protoProps.initialize = function() {
        try {
          this._computedCache = new Map();
        } catch (e) {
          console.error('Error creating computed cache:', e);
          this._computedCache = {};
        }
        return computedInit.apply(this, arguments);
      };
      delete protoProps.computed;
    }

    if (hasReactive) {
      var reactiveInit = protoProps.initialize || function(){};
      protoProps.initialize = function() {
        reactiveInit.apply(this, arguments);
        var reactiveWrap = typeof Backbone !== 'undefined' && Backbone.Reactive && Backbone.Reactive.wrap;
        if (this.reactive !== false && reactiveWrap && !this._reactiveProxy) {
          try {
            Backbone.Reactive.wrap(this);
          } catch (e) {
            console.error('Failed to wrap collection:', e);
          }
        }
      };
    }

    return originalCollectionExtend.call(this, protoProps, staticProps);
  };

  Backbone.View.extend = function(protoProps, staticProps) {
    var isReactive = protoProps && (protoProps.reactive || Backbone.View.reactive);

    if (isReactive && protoProps.render) {
      var originalRender = protoProps.render;

      protoProps.render = function() {
        // Only apply reactive wrapper if view has model or collection
        var hasModelOrCollection = !!(this.model || this.collection);

        if (!hasModelOrCollection) {
          return originalRender.call(this);
        }

        if (this._rendering) {
          return this;
        }

        this._rendering = true;

        try {
          if (!this.el) {
            if (this.tagName) {
              try {
                this._ensureElement();
              } catch (e) {
                console.warn('Failed to ensure element:', e);
                return originalRender.call(this);
              }
            } else {
              return originalRender.call(this);
            }
          }

          if (!this.el) {
            return originalRender.call(this);
          }

          if (!this.$el && this.el) {
            this.$el = Backbone.$(this.el);
          }

          if (!this._reactiveContext) {
            this._reactiveListeners = this._reactiveListeners || [];
            this._reactiveContext = new ReactiveContext(this);
          } else {
            this._reactiveListeners = this._reactiveListeners || [];
            this._reactiveContext.clear();
          }

          var originalModel = this.model;
          var reactiveModel = null;

          if (originalModel && Backbone.Reactive && Backbone.Reactive.wrap) {
            if (originalModel._reactiveProxy) {
              reactiveModel = originalModel._reactiveProxy;
            } else {
              try {
                reactiveModel = Backbone.Reactive.wrap(originalModel);
                if (reactiveModel === originalModel && originalModel._reactiveProxy) {
                  reactiveModel = originalModel._reactiveProxy;
                }
              } catch (e) {
                console.error('Error wrapping model in view render:', e);
                reactiveModel = originalModel;
              }
            }
          }

          var originalCollection = this.collection;
          var reactiveCollection = null;

          if (originalCollection) {
            if (originalCollection._reactiveProxy) {
              reactiveCollection = originalCollection._reactiveProxy;
            } else if (Backbone.Reactive && Backbone.Reactive.wrap) {
              try {
                reactiveCollection = Backbone.Reactive.wrap(originalCollection);
              } catch (e) {
                console.error('Error wrapping collection in view render:', e);
                reactiveCollection = originalCollection;
              }
            } else {
              reactiveCollection = originalCollection;
            }
          }

          var modelProxy = reactiveModel || originalModel && originalModel._reactiveProxy || originalModel;
          var collectionProxy = reactiveCollection || originalCollection && originalCollection._reactiveProxy || originalCollection;

          var needsModelRestore = modelProxy !== originalModel;
          var needsCollectionRestore = collectionProxy !== originalCollection;

          this.model = modelProxy;
          this.collection = collectionProxy;

          var result = ReactiveContext.run(function() {
            if (this.model === originalModel && originalModel && originalModel._reactiveProxy) {
              this.model = originalModel._reactiveProxy;
            }
            return originalRender.call(this);
          }.bind(this), this._reactiveContext);

          if (needsModelRestore) {
            this.model = originalModel;
          }

          if (needsCollectionRestore) {
            this.collection = originalCollection;
          }

          if (!this._reactiveContext.isEmpty() && this.el) {
            this._setupReactiveBindings();
          }

          if (this.collection && this.el) {
            this._setupCollectionBindings();
          }

          return result;
        } catch (error) {
          console.error('Error in reactive render wrapper:', error);
          return originalRender.call(this);
        } finally {
          this._rendering = false;
        }
      };
    }

    return originalViewExtend.call(this, protoProps, staticProps);
  };

  Backbone.View.prototype.setElement = function(element) {
    var result = originalViewSetElement.call(this, element);

    // After element is set, set up collection bindings if view is reactive
    var isReactive = this.reactive || this.constructor.prototype.reactive;
    if (isReactive && this.collection && this.el) {
      // Set up bindings immediately - el is guaranteed to be set after setElement
      this._setupCollectionBindings();
    }

    return result;
  };

  Backbone.View.prototype.initialize = function(options) {
    if (originalViewInitialize) {
      originalViewInitialize.call(this, options);
    }
  };

  // Note: Reactive views get their render() wrapped via View.extend() above
  // Non-reactive views use their own render() methods

  Backbone.View.prototype._setupReactiveBindings_placeholder_delete_me = function() {
    // Only apply reactive wrapper if view is reactive AND has either model or collection
    // Check both instance property and prototype property for reactive flag
    var isReactive = this.reactive || this.constructor.prototype.reactive;
    var hasModelOrCollection = !!(this.model || this.collection);

    // If not reactive or no model/collection, still set up collection bindings if needed
    if (!isReactive || !hasModelOrCollection) {
      var result = originalViewRender.call(this);
      // Fallback: ALWAYS set up collection bindings if view has collection and is reactive
      // This ensures bindings work even if reactive wrapper path wasn't taken
      if (isReactive && this.collection && this.el) {
        this._setupCollectionBindings();
      }
      return result;
    }

    if (this._rendering) {
      return this;
    }

    this._rendering = true;

    try {
      if (!this.el) {
        if (this.tagName) {
          try {
            this._ensureElement();
          } catch (e) {
            console.warn('Failed to ensure element:', e);
            return originalViewRender.call(this);
          }
        } else {
          return originalViewRender.call(this);
        }
      }

      if (!this.el) {
        return originalViewRender.call(this);
      }

      if (!this.$el && this.el) {
        this.$el = Backbone.$(this.el);
      }

      if (!this._reactiveContext) {
        this._reactiveListeners = this._reactiveListeners || [];
        this._reactiveContext = new ReactiveContext(this);
      } else {
        this._reactiveListeners = this._reactiveListeners || [];
        this._reactiveContext.clear();
      }

      var originalModel = this.model;
      var reactiveModel = null;

      // Always wrap model if view is reactive, regardless of model's reactive flag
      if (originalModel && isReactive && Backbone.Reactive && Backbone.Reactive.wrap) {
        // Always wrap - use existing proxy if available, otherwise create new one
        if (originalModel._reactiveProxy) {
          reactiveModel = originalModel._reactiveProxy;
        } else {
          try {
            reactiveModel = Backbone.Reactive.wrap(originalModel);
            // wrap() stores the proxy in originalModel._reactiveProxy and returns the proxy
            // Verify we got the proxy, not the original model
            if (reactiveModel === originalModel) {
              // wrap() returned original model, but it should have stored proxy in _reactiveProxy
              if (originalModel._reactiveProxy) {
                reactiveModel = originalModel._reactiveProxy;
              } else {
                // This shouldn't happen, but if it does, we can't track dependencies
                reactiveModel = originalModel;
              }
            }
          } catch (e) {
            console.error('Error wrapping model in view render:', e);
            reactiveModel = originalModel;
          }
        }
      }

      var originalCollection = this.collection;
      var reactiveCollection = null;

      // Always wrap collection if view is reactive
      if (originalCollection && isReactive) {
        if (originalCollection._reactiveProxy) {
          reactiveCollection = originalCollection._reactiveProxy;
        } else if (Backbone.Reactive && Backbone.Reactive.wrap) {
          try {
            reactiveCollection = Backbone.Reactive.wrap(originalCollection);
          } catch (e) {
            console.error('Error wrapping collection in view render:', e);
            reactiveCollection = originalCollection;
          }
        } else {
          reactiveCollection = originalCollection;
        }
      }

      // CRITICAL: Set model/collection to proxy BEFORE render so dependencies are tracked
      // Ensure we always have a proxy - use reactiveModel if available, otherwise check _reactiveProxy
      var modelProxy = reactiveModel;

      // If reactiveModel is null or equals originalModel, try to get proxy from _reactiveProxy
      if (!modelProxy || modelProxy === originalModel) {
        if (originalModel && originalModel._reactiveProxy) {
          modelProxy = originalModel._reactiveProxy;
        } else if (originalModel && isReactive && Backbone.Reactive && Backbone.Reactive.wrap) {
          // Last resort: wrap now if not already wrapped
          try {
            modelProxy = Backbone.Reactive.wrap(originalModel);
            if (originalModel._reactiveProxy) {
              modelProxy = originalModel._reactiveProxy;
            }
          } catch (e) {
            console.error('Error wrapping model in render (fallback):', e);
            modelProxy = originalModel;
          }
        } else {
          modelProxy = originalModel;
        }
      }

      var collectionProxy = reactiveCollection || originalCollection && originalCollection._reactiveProxy || originalCollection;

      // Store flags to know if we need to restore originals after render
      var needsModelRestore = modelProxy !== originalModel;
      var needsCollectionRestore = collectionProxy !== originalCollection;

      // ALWAYS set to proxy before render - CRITICAL for dependency tracking
      // Ensure modelProxy is actually a proxy (not the original model)
      // A proxy has _reactiveProxy pointing to itself
      if (!modelProxy || modelProxy === originalModel) {
        // modelProxy is not a proxy, try to get it from _reactiveProxy
        if (originalModel && originalModel._reactiveProxy) {
          modelProxy = originalModel._reactiveProxy;
        }
      }

      // Set this.model to the proxy so that this.model.get() goes through the proxy's get trap
      // CRITICAL: Verify modelProxy is actually a proxy before setting
      // A proxy has _reactiveProxy property pointing to itself
      if (modelProxy && modelProxy._reactiveProxy === modelProxy) {
        // Confirmed proxy
        this.model = modelProxy;
      } else if (originalModel && originalModel._reactiveProxy) {
        // Use proxy from _reactiveProxy if modelProxy verification failed
        this.model = originalModel._reactiveProxy;
      } else {
        // Fallback: use modelProxy even if not verified (shouldn't happen)
        this.model = modelProxy;
      }

      this.collection = collectionProxy;

      // Run render with reactive context active so dependencies are tracked
      var result = ReactiveContext.run(function() {
        // CRITICAL: Ensure this.model is the proxy inside render
        // Double-check because something might have changed it
        var currentModel = this.model;
        if (currentModel === originalModel && originalModel && originalModel._reactiveProxy) {
          this.model = originalModel._reactiveProxy;
        } else if (currentModel && currentModel._reactiveProxy !== currentModel && originalModel && originalModel._reactiveProxy) {
          // Current model is not a proxy, use the proxy
          this.model = originalModel._reactiveProxy;
        }
        return originalViewRender.call(this);
      }.bind(this), this._reactiveContext);

      // Restore original model/collection after render
      if (needsModelRestore) {
        this.model = originalModel;
      }

      if (needsCollectionRestore) {
        this.collection = originalCollection;
      }

      if (!this._reactiveContext.isEmpty() && this.el) {
        this._setupReactiveBindings();
      }

      // Always set up collection bindings if collection exists and view is reactive
      // Set up AFTER render so this.el is guaranteed to exist
      // Check both instance property and prototype property for reactive flag
      var isReactiveForBindings = this.reactive || this.constructor.prototype.reactive;
      // ALWAYS set up bindings if collection exists - don't check reactive flag here
      // because we already know we're in the reactive wrapper path
      if (this.collection && this.el) {
        this._setupCollectionBindings();
      }

      return result;
    } catch (error) {
      console.error('Error in reactive render wrapper:', error);
      return originalViewRender.call(this);
    } finally {
      this._rendering = false;
    }
  };


  Backbone.View.prototype._setupReactiveBindings = function() {
    if (!this.el) {
      return;
    }

    if (!this._reactiveContext) {
      return;
    }

    if (this._reactiveListeners) {
      this._reactiveListeners.forEach(function(listener) {
        this.stopListening(listener.model, listener.event, listener.handler);
      }.bind(this));
    }
    this._reactiveListeners = [];

    var self = this;
    this._reactiveContext.dependencies.forEach(function(dep) {
      if (reactiveSystem.tracker) {
        reactiveSystem.tracker.addDependency(self, dep.model, dep.prop);
      }

      var handler = function() {
        if (!self.el || !self.el.parentNode) {
          return;
        }
        // Default to batching updates unless explicitly disabled
        if (self.reactiveOptions && self.reactiveOptions.batch === false) {
          self.render();
        } else if (reactiveSystem && reactiveSystem.scheduler) {
          reactiveSystem.scheduler.scheduleUpdate(self, dep.model, dep.prop);
        } else {
          // Fallback if scheduler not available
          self.render();
        }
      };

      self.listenTo(dep.model, 'change:' + dep.prop, handler);
      self._reactiveListeners.push({
        model: dep.model,
        event: 'change:' + dep.prop,
        handler: handler
      });
    });

    // Collection bindings are set up separately in render() to ensure they're always set up
  };

  Backbone.View.prototype._setupCollectionBindings = function() {
    // Ensure el is a DOM element, not a selector string
    if (!this.el) {
      return;
    }

    // If el is a string selector, resolve it to the actual element
    var el = typeof this.el === 'string' ? document.querySelector(this.el) : this.el;
    if (!el || !this.collection) {
      return;
    }

    // Clean up old listeners
    if (this._collectionListeners) {
      this._collectionListeners.forEach(function(listener) {
        this.stopListening(listener.model, listener.event, listener.handler);
      }.bind(this));
    }
    this._collectionListeners = [];

    var self = this;
    var handler = function(model, collection, options) {
      // Always render when collection changes, regardless of reactive options
      var currentEl = typeof self.el === 'string' ? document.querySelector(self.el) : self.el;
      if (!currentEl || !currentEl.parentNode) {
        return;
      }
      // Don't re-render if already rendering (prevents infinite loops)
      if (self._rendering) {
        return;
      }
      // Force immediate render for collection changes to ensure UI updates
      // Collection changes are typically user-initiated and should be immediate
      self.render();
    };

    // Set up listeners for collection events
    // Use 'update' event which fires after add/remove/reset operations
    // This is more efficient than listening to individual events which would cause multiple renders
    ['reset', 'sort', 'update'].forEach(function(event) {
      // Use listenTo to set up the event listener - this is the proper Backbone way
      // listenTo ensures proper cleanup when view is removed
      self.listenTo(self.collection, event, handler);

      // Track the listener for cleanup
      if (!self._collectionListeners) self._collectionListeners = [];
      self._collectionListeners.push({
        model: self.collection,
        event: event,
        handler: handler
      });
    });
  };

  Backbone.View.prototype.remove = function() {
    if (this.reactive) {
      // Stop listening to all reactive listeners before clearing
      if (this._reactiveListeners && Array.isArray(this._reactiveListeners)) {
        this._reactiveListeners.forEach(function(listener) {
          this.stopListening(listener.model, listener.event, listener.handler);
        }.bind(this));
      }

      // Stop listening to all collection listeners before clearing
      if (this._collectionListeners && Array.isArray(this._collectionListeners)) {
        this._collectionListeners.forEach(function(listener) {
          this.stopListening(listener.model, listener.event, listener.handler);
        }.bind(this));
      }

      if (reactiveSystem.tracker) {
        reactiveSystem.tracker.removeView(this);
      }

      if (reactiveSystem.scheduler) {
        reactiveSystem.scheduler.cancelForView(this);
      }

      this._reactiveContext = null;
      this._reactiveListeners = null;
      this._collectionListeners = null;
    }
    return originalViewRemove.call(this);
  };

})(typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : this);
