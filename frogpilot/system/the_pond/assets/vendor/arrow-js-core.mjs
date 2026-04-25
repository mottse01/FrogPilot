// node_modules/@arrow-js/core/dist/index.mjs
var queueStack = /* @__PURE__ */ new Set();
var nextTicks = /* @__PURE__ */ new Set();
function nextTick(fn) {
  if (!queueStack.size) {
    if (fn)
      fn();
    return Promise.resolve();
  }
  let resolve;
  const p = new Promise((r2) => {
    resolve = r2;
  });
  nextTicks.add(() => {
    if (fn)
      fn();
    resolve();
  });
  return p;
}
function isTpl(template) {
  return typeof template === "function" && !!template.isT;
}
function isR(obj) {
  return typeof obj === "object" && obj !== null && "$on" in obj && typeof obj.$on === "function";
}
function isReactiveFunction(fn) {
  return "$on" in fn;
}
function queue(fn) {
  return (newValue, oldValue) => {
    function executeQueue() {
      const queue2 = Array.from(queueStack);
      queueStack.clear();
      const ticks = Array.from(nextTicks);
      nextTicks.clear();
      queue2.forEach((fn2) => fn2(newValue, oldValue));
      ticks.forEach((fn2) => fn2());
      if (queueStack.size) {
        queueMicrotask(executeQueue);
      }
    }
    if (!queueStack.size) {
      queueMicrotask(executeQueue);
    }
    queueStack.add(fn);
  };
}
var measurements = {};
function measure(label, fn) {
  const start = performance.now();
  const isFn = typeof fn === "function";
  label = isFn ? `${label} (ms)` : `${label} (calls)`;
  const x = isFn ? fn() : fn;
  const result = isFn ? performance.now() - start : fn;
  if (!measurements[label])
    measurements[label] = [result];
  else
    measurements[label].push(result);
  return x;
}
var dependencyCollector = /* @__PURE__ */ new Map();
function r(data, state = {}) {
  if (isR(data) || typeof data !== "object")
    return data;
  const observers = state.o || /* @__PURE__ */ new Map();
  const observerProperties = state.op || /* @__PURE__ */ new Map();
  const isArray = Array.isArray(data);
  const children = [];
  const proxySource = isArray ? [] : Object.create(data, {});
  for (const property in data) {
    const entry = data[property];
    if (typeof entry === "object" && entry !== null) {
      proxySource[property] = !isR(entry) ? r(entry) : entry;
      children.push(property);
    } else {
      proxySource[property] = entry;
    }
  }
  const dep = (a) => (p, c) => {
    let obs = observers.get(p);
    let props = observerProperties.get(c);
    if (!obs) {
      obs = /* @__PURE__ */ new Set();
      observers.set(p, obs);
    }
    if (!props) {
      props = /* @__PURE__ */ new Set();
      observerProperties.set(c, props);
    }
    obs[a](c);
    props[a](p);
  };
  const $on = dep("add");
  const $off = dep("delete");
  const _em = (property, newValue, oldValue) => {
    observers.has(property) && observers.get(property).forEach((c) => c(newValue, oldValue));
  };
  const _st = () => {
    return {
      o: observers,
      op: observerProperties,
      r: proxySource,
      p: proxy._p
    };
  };
  const depProps = {
    $on,
    $off,
    _em,
    _st,
    _p: void 0
  };
  const proxy = new Proxy(proxySource, {
    has(target, key) {
      return key in depProps || key in target;
    },
    get(...args) {
      const [, p] = args;
      if (Reflect.has(depProps, p))
        return Reflect.get(depProps, p);
      const value = Reflect.get(...args);
      addDep(proxy, p);
      if (isArray && p in Array.prototype) {
        return arrayOperation(p, proxySource, proxy, value);
      }
      return value;
    },
    set(...args) {
      const [target, property, value] = args;
      const old = Reflect.get(target, property);
      if (Reflect.has(depProps, property)) {
        return Reflect.set(depProps, property, value);
      }
      if (value && isR(old)) {
        const o = old;
        const oldState = o._st();
        const newR = isR(value) ? reactiveMerge(value, o) : r(value, oldState);
        Reflect.set(
          target,
          property,
          // Create a new reactive object
          newR
        );
        _em(property, newR);
        oldState.o.forEach((_c, property2) => {
          const oldValue = Reflect.get(old, property2);
          const newValue = Reflect.get(newR, property2);
          if (oldValue !== newValue) {
            o._em(property2, newValue, oldValue);
          }
        });
        return true;
      }
      const didSet = Reflect.set(...args);
      if (didSet) {
        if (old !== value) {
          _em(property, value, old);
        }
        if (proxy._p) {
          proxy._p[1]._em(...proxy._p);
        }
      }
      return didSet;
    }
  });
  if (state.p)
    proxy._p = state.p;
  children.map((c) => {
    proxy[c]._p = [c, proxy];
  });
  return proxy;
}
function addDep(proxy, property) {
  dependencyCollector.forEach((tracker) => {
    let properties = tracker.get(proxy);
    if (!properties) {
      properties = /* @__PURE__ */ new Set();
      tracker.set(proxy, properties);
    }
    properties.add(property);
  });
}
function arrayOperation(op, arr, proxy, native) {
  const synthetic = (...args) => {
    const retVal = Array.prototype[op].call(arr, ...args);
    arr.forEach((item, i) => proxy._em(String(i), item));
    if (proxy._p) {
      const [property, parent] = proxy._p;
      parent._em(property, proxy);
    }
    return retVal;
  };
  switch (op) {
    case "shift":
    case "pop":
    case "sort":
    case "reverse":
    case "copyWithin":
      return synthetic;
    case "unshift":
    case "push":
    case "fill":
      return (...args) => synthetic(...args.map((arg) => r(arg)));
    case "splice":
      return function(start, remove, ...inserts) {
        return arguments.length === 1 ? synthetic(start) : synthetic(start, remove, ...inserts.map((arg) => r(arg)));
      };
    default:
      return native;
  }
}
function reactiveMerge(reactiveTarget, reactiveSource) {
  const state = reactiveSource._st();
  if (state.o) {
    state.o.forEach((callbacks, property) => {
      callbacks.forEach((c) => {
        reactiveTarget.$on(property, c);
      });
    });
  }
  if (state.p) {
    reactiveTarget._p = state.p;
  }
  return reactiveTarget;
}
function w(fn, after) {
  const trackingId = /* @__PURE__ */ Symbol();
  if (!dependencyCollector.has(trackingId)) {
    dependencyCollector.set(trackingId, /* @__PURE__ */ new Map());
  }
  let currentDeps = /* @__PURE__ */ new Map();
  const queuedCallFn = queue(callFn);
  function callFn() {
    dependencyCollector.set(trackingId, /* @__PURE__ */ new Map());
    const value = fn();
    const newDeps = dependencyCollector.get(trackingId);
    dependencyCollector.delete(trackingId);
    currentDeps.forEach((propertiesToUnobserve, proxy) => {
      const newProperties = newDeps.get(proxy);
      if (newProperties) {
        newProperties.forEach((prop) => propertiesToUnobserve.delete(prop));
      }
      propertiesToUnobserve.forEach((prop) => proxy.$off(prop, queuedCallFn));
    });
    newDeps.forEach((properties, proxy) => {
      properties.forEach((prop) => proxy.$on(prop, queuedCallFn));
    });
    currentDeps = newDeps;
    return after ? after(value) : value;
  }
  if (isReactiveFunction(fn))
    fn.$on(callFn);
  return callFn();
}
var listeners = /* @__PURE__ */ new WeakMap();
var templateMemo = {};
var delimiter = "\u27B3\u274D";
var bookend = "\u274D\u21DA";
var delimiterComment = `<!--${delimiter}-->`;
var bookendComment = `<!--${bookend}-->`;
function t(strings, ...expSlots) {
  const expressions = [];
  let str = "";
  const addExpressions = (expression, html2) => {
    if (typeof expression === "function") {
      let observer = () => {
      };
      expressions.push(Object.assign((...args) => expression(...args), {
        e: expression,
        $on: (obs) => {
          observer = obs;
        },
        _up: (exp) => {
          expression = exp;
          observer();
        }
      }));
      return html2 + delimiterComment;
    }
    if (Array.isArray(expression)) {
      return expression.reduce((html3, exp) => addExpressions(exp, html3), html2);
    }
    return html2 + expression;
  };
  const toString = () => {
    if (!str) {
      if (!expSlots.length && strings.length === 1 && strings[0] === "") {
        str = "<!---->";
      } else {
        str = strings.reduce(function interlaceTemplate(html2, strVal, i) {
          html2 += strVal;
          return expSlots[i] !== void 0 ? addExpressions(expSlots[i], html2) : html2;
        }, "");
      }
    }
    return str;
  };
  const template = (el) => {
    const dom = createNodes(toString());
    const frag = fragment(dom, { i: 0, e: expressions });
    return el ? frag(el) : frag();
  };
  template.isT = true;
  template._k = 0;
  template._h = () => [toString(), expressions, template._k];
  template.key = (key) => {
    template._k = key;
    return template;
  };
  return template;
}
function fragment(dom, expressions) {
  let node;
  let i = 0;
  const children = dom.childNodes;
  while (node = children.item(i++)) {
    if (node.nodeType === 8 && node.nodeValue === delimiter) {
      comment(node, expressions);
      continue;
    }
    if (node instanceof Element)
      attrs(node, expressions);
    if (node.hasChildNodes()) {
      fragment(node, expressions);
    }
    if (node instanceof HTMLOptionElement)
      node.selected = node.defaultSelected;
  }
  return ((parent) => {
    if (parent) {
      parent.appendChild(dom);
      return parent;
    }
    return dom;
  });
}
function attrs(node, expressions) {
  var _a;
  const toRemove = [];
  let i = 0;
  let attr;
  while (attr = node.attributes[i++]) {
    if (expressions.i >= expressions.e.length)
      return;
    if (attr.value !== delimiterComment)
      continue;
    let attrName = attr.name;
    const expression = expressions.e[expressions.i++];
    if (attrName.charAt(0) === "@") {
      const event = attrName.substring(1);
      node.addEventListener(event, expression);
      if (!listeners.has(node))
        listeners.set(node, /* @__PURE__ */ new Map());
      (_a = listeners.get(node)) === null || _a === void 0 ? void 0 : _a.set(event, expression);
      toRemove.push(attrName);
    } else {
      const isIDL = attrName === "value" && "value" in node || attrName === "checked" || attrName.startsWith(".") && (attrName = attrName.substring(1));
      w(expression, (value) => {
        if (isIDL) {
          node[attrName] = value;
          if (node.getAttribute(attrName) != value)
            value = false;
        }
        value !== false ? node.setAttribute(attrName, value) : (node.removeAttribute(attrName), i--);
      });
    }
  }
  toRemove.forEach((attrName) => node.removeAttribute(attrName));
}
function removeNodes(node) {
  node.forEach(removeNode);
}
function removeNode(node) {
  var _a;
  node.remove();
  (_a = listeners.get(node)) === null || _a === void 0 ? void 0 : _a.forEach((listener, event) => node.removeEventListener(event, listener));
}
function comment(node, expressions) {
  var _a;
  const expression = expressions.e[expressions.i++];
  let boundNode;
  if (expression && isTpl(expression.e)) {
    boundNode = createPartial().add(expression.e)();
  } else {
    let partialMemo;
    boundNode = (partialMemo = w(expression, (value) => setNode(value, partialMemo)))();
  }
  (_a = node.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(boundNode, node);
}
function setNode(value, p) {
  const isUpdate = typeof p === "function";
  const partial = isUpdate ? p : createPartial();
  Array.isArray(value) ? value.forEach((item) => measure("partialAdd", () => partial.add(item))) : partial.add(value);
  if (isUpdate)
    partial._up();
  return partial;
}
function createNodes(html2) {
  var _a;
  const tpl = (_a = templateMemo[html2]) !== null && _a !== void 0 ? _a : (() => {
    const tpl2 = document.createElement("template");
    tpl2.innerHTML = html2;
    return templateMemo[html2] = tpl2;
  })();
  const dom = tpl.content.cloneNode(true);
  dom.normalize();
  return dom;
}
function createPartial(group = /* @__PURE__ */ Symbol()) {
  let html2 = "";
  let expressions = { i: 0, e: [] };
  let chunks = [];
  let previousChunks = [];
  const keyedChunks = /* @__PURE__ */ new Map();
  const toRemove = [];
  const partial = () => {
    let dom;
    if (!chunks.length)
      addPlaceholderChunk();
    if (chunks.length === 1 && !isTpl(chunks[0].tpl)) {
      const chunk = chunks[0];
      chunk.dom.length ? chunk.dom[0].nodeValue = chunk.tpl : chunk.dom.push(document.createTextNode(chunk.tpl));
      dom = chunk.dom[0];
    } else {
      dom = assignDomChunks(fragment(createNodes(html2), expressions)());
    }
    reset();
    return dom;
  };
  partial.ch = () => previousChunks;
  partial.l = 0;
  partial.add = (tpl) => {
    if (!tpl && tpl !== 0)
      return partial;
    let localExpressions = [];
    let key;
    let template = "";
    if (isTpl(tpl)) {
      [template, localExpressions, key] = tpl._h();
    }
    html2 += template;
    html2 += bookendComment;
    const keyedChunk = key && keyedChunks.get(key);
    const chunk = keyedChunk || {
      html: template,
      exp: localExpressions,
      dom: [],
      tpl,
      key
    };
    chunks.push(chunk);
    if (key) {
      keyedChunk ? keyedChunk.exp.forEach((exp, i) => exp._up(localExpressions[i].e)) : keyedChunks.set(key, chunk);
    }
    expressions.e.push(...localExpressions);
    partial.l++;
    return partial;
  };
  partial._up = () => {
    const subPartial = createPartial(group);
    let startChunking = 0;
    let lastNode = previousChunks[0].dom[0];
    if (!chunks.length)
      addPlaceholderChunk(document.createComment(""));
    const closeSubPartial = () => {
      if (!subPartial.l)
        return;
      const frag = subPartial();
      const last = frag.lastChild;
      lastNode[startChunking ? "after" : "before"](frag);
      transferChunks(subPartial, chunks, startChunking);
      lastNode = last;
    };
    chunks.forEach((chunk, index) => {
      const prev = previousChunks[index];
      if (chunk.key && chunk.dom.length) {
        closeSubPartial();
        if (!prev || prev.dom !== chunk.dom) {
          lastNode[index ? "after" : "before"](...chunk.dom);
        }
        lastNode = chunk.dom[chunk.dom.length - 1];
      } else if (prev && chunk.html === prev.html && !prev.key) {
        closeSubPartial();
        prev.exp.forEach((expression, i) => expression._up(chunk.exp[i].e));
        chunk.exp = prev.exp;
        chunk.dom = prev.dom;
        lastNode = chunk.dom[chunk.dom.length - 1];
        if (isTextNodeChunk(chunk) && lastNode instanceof Text) {
          lastNode.nodeValue = chunk.tpl;
        }
      } else {
        if (prev && chunk.html !== prev.html && !prev.key) {
          toRemove.push(...prev.dom);
        }
        if (!subPartial.l)
          startChunking = index;
        subPartial.add(chunk.tpl);
      }
    });
    closeSubPartial();
    let node = lastNode === null || lastNode === void 0 ? void 0 : lastNode.nextSibling;
    while (node && group in node) {
      toRemove.push(node);
      const next = node.nextSibling;
      node = next;
    }
    removeNodes(toRemove);
    reset();
  };
  const reset = () => {
    toRemove.length = 0;
    html2 = "";
    partial.l = 0;
    expressions = { i: 0, e: [] };
    previousChunks = [...chunks];
    chunks = [];
  };
  const addPlaceholderChunk = (node) => {
    html2 = "<!---->";
    chunks.push({
      html: html2,
      exp: [],
      dom: node ? [node] : [],
      tpl: t`${html2}`,
      key: 0
    });
  };
  const assignDomChunks = (frag) => {
    let chunkIndex = 0;
    const toRemove2 = [];
    frag.childNodes.forEach((node) => {
      if (node.nodeType === 8 && node.data === bookend) {
        chunkIndex++;
        toRemove2.push(node);
        return;
      }
      Object.defineProperty(node, group, { value: group });
      chunks[chunkIndex].dom.push(node);
    });
    toRemove2.forEach((node) => node.remove());
    return frag;
  };
  const transferChunks = (partialA, chunksB, chunkIndex) => {
    partialA.ch().forEach((chunk, index) => {
      chunksB[chunkIndex + index].dom = chunk.dom;
    });
  };
  return partial;
}
function isTextNodeChunk(chunk) {
  return chunk.dom.length === 1 && !isTpl(chunk.tpl);
}
var html = t;
var reactive = r;
var watch = w;
export {
  html,
  measurements,
  nextTick,
  r,
  reactive,
  t,
  w,
  watch
};
