import Backbone from 'backbone';

// Provide useful information when things go wrong.
export default function() {
  // Introspect Backbone.
  var $ = Backbone.$, _b = Backbone._debug(), _ = _b._, root = _b.root;
  // Helper to pick properties from an object
  var pick = function(obj, keys) {
    var result = {};
    if (obj == null) return result;
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key in obj) result[key] = obj[key];
    }
    return result;
  };
  var info = {
    backbone: Backbone.VERSION,
    // Is this the exact released version, or a later development version?
    /* This is automatically temporarily replaced when publishing a release,
       so please don't edit this. */
    distribution: 'MARK_DEVELOPMENT',
    _: _.VERSION || 'built-in',
    $: !$ ? false : $.fn && $.fn.jquery ? $.fn.jquery :
      $.zepto ? 'zepto' : $.ender ? 'ender' : true
  };
  if (typeof root.Deno !== 'undefined') {
    info.deno = pick(root.Deno, ['version', 'build']);
  } else if (typeof root.process !== 'undefined') {
    info.process = pick(root.process, ['version', 'platform', 'arch']);
  } else if (typeof root.navigator !== 'undefined') {
    info.navigator = pick(root.navigator, ['userAgent', 'platform', 'webdriver']);
  }
  /* eslint-disable-next-line no-console */
  console.debug('Backbone debug info: ', JSON.stringify(info, null, 4));
  return info;
}
