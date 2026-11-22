/* Original single-sheet artwork generated from the validated paternal tree. */
(function (scope, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./botanical-core.js'));
  else scope.HeritagePoster = factory(scope.BotanicalCore);
})(globalThis, function (core) {
  'use strict';
  const width = 1200;
  const height = 1697;
  const crown = { x: 600, y: 773, rx: 528, ry: 570 };
  const ink = '#392717';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const round = value => Math.round(value * 100) / 100;
  const pair = point => `${round(point.x)} ${round(point.y)}`;
  const mix = (a, b, t) => a + (b - a) * t;
  const noise = index => ((Math.imul(index + 43, 2654435761) >>> 0) % 1009) / 1009;

  function wrap(text, limit, measure) {
    const lines = [];
    const words = text.trim().match(/عبد[ \t]+[^\s]+|[^ \t\r\n]+/gu) || [];
    for (const word of words) {
      const previous = lines.at(-1);
      if (previous && measure(`${previous} ${word}`) <= limit) lines[lines.length - 1] += ` ${word}`;
      else lines.push(word);
    }
    return lines;
  }

  function contain(node) {
    const rx = Math.max(10, crown.rx - node.w / 2);
    const ry = Math.max(10, crown.ry - node.h / 2);
    const radius = Math.hypot((node.x - crown.x) / rx, (node.y - crown.y) / ry);
    if (radius > 1) {
      node.x = crown.x + (node.x - crown.x) / radius;
      node.y = crown.y + (node.y - crown.y) / radius;
    }
  }

  function separates(a, b, gap) {
    return Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + gap ||
      Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + gap;
  }

  function repairPlacement(nodes) {
    const cellSize = 48;
    const cells = new Map();
    function cellBounds(node, gap) {
      return [Math.floor((node.x - node.w / 2 - gap) / cellSize),
        Math.floor((node.y - node.h / 2 - gap) / cellSize),
        Math.floor((node.x + node.w / 2 + gap) / cellSize),
        Math.floor((node.y + node.h / 2 + gap) / cellSize)];
    }
    function free(node) {
      const [left,top,right,bottom] = cellBounds(node, 4);
      for (let y=top;y<=bottom;y++) for (let x=left;x<=right;x++) {
        const bucket = cells.get(y*100+x);
        if (bucket?.some(other => !separates(node,other,4))) return false;
      }
      return true;
    }
    const ordered = [...nodes].sort((a, b) => a.generation - b.generation || a.index - b.index);
    for (const node of ordered) {
      const origin = { x: node.x, y: node.y };
      const fits = () => Math.hypot((node.x - crown.x) / (crown.rx - node.w / 2),
        (node.y - crown.y) / (crown.ry - node.h / 2)) <= 1 && free(node);
      let found = fits();
      for (let radius = 5; !found && radius < 1120; radius += 5) {
        const directions = Math.ceil(Math.PI * 2 * radius / 7);
        for (let step = 0; step < directions; step++) {
          const angle = step * Math.PI * 2 / directions;
          node.x = origin.x + radius * Math.cos(angle);
          node.y = origin.y + radius * Math.sin(angle);
          if (fits()) { found = true; break; }
        }
      }
      if (!found) Object.assign(node, origin);
      const [left,top,right,bottom] = cellBounds(node, 0);
      for (let y=top;y<=bottom;y++) for (let x=left;x<=right;x++) {
        const key = y*100+x;
        if (!cells.has(key)) cells.set(key,[]);
        cells.get(key).push(node);
      }
    }
  }

  function spread(nodes) {
    // Ordered pair relaxation keeps the seed repeatable and the labels editable.
    for (let pass = 0; pass < 235; pass++) {
      let overlaps = 0;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const ox = (a.w + b.w) / 2 + 3 - Math.abs(dx);
          const oy = (a.h + b.h) / 2 + 3 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          overlaps++;
          const fraction = a.generation === 0 ? 0 : a.children.length && !b.children.length ? .28 : .5;
          if (ox < oy * 1.42) {
            const move = (ox + .09) * (dx < 0 ? -1 : 1);
            a.x -= move * fraction; b.x += move * (1 - fraction);
          } else {
            const move = (oy + .09) * (dy < 0 ? -1 : 1);
            a.y -= move * fraction; b.y += move * (1 - fraction);
          }
        }
      }
      for (const node of nodes.slice(1)) contain(node);
      if (overlaps === 0) break;
    }
  }

  function cubic(a, b, c, d, t) {
    const u = 1 - t;
    return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
      y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y };
  }

  function branchGrid(nodes, step = 6) {
    const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
    const cells = new Int32Array(cols * rows);
    for (const n of nodes) {
      const left = Math.max(0, Math.floor((n.x - n.w / 2 - 1.7) / step));
      const right = Math.min(cols - 1, Math.ceil((n.x + n.w / 2 + 1.7) / step));
      const top = Math.max(0, Math.floor((n.y - n.h / 2 - 1.7) / step));
      const bottom = Math.min(rows - 1, Math.ceil((n.y + n.h / 2 + 1.7) / step));
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
        if (Math.abs(x * step - n.x) <= n.w / 2 + 1.7 && Math.abs(y * step - n.y) <= n.h / 2 + 1.7) cells[y * cols + x] = n.index + 1;
      }
    }
    return { step, cols, rows, cells };
  }

  function shortestWeightedPath(start, end, cols, size, neighbors) {
    const previous = new Int32Array(size).fill(-1);
    const costs = new Float64Array(size).fill(Infinity);
    const heap = [];
    const heuristic = id => Math.hypot(id % cols - end % cols, Math.floor(id / cols) - Math.floor(end / cols));
    function push(item) {
      let i = heap.length;
      heap.push(item);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].priority <= item.priority) break;
        heap[i] = heap[parent];
        i = parent;
      }
      heap[i] = item;
    }
    function pop() {
      const first = heap[0], last = heap.pop();
      if (!heap.length) return first;
      let i = 0;
      while (2*i+1 < heap.length) {
        let child = 2*i+1;
        if (child+1 < heap.length && heap[child+1].priority < heap[child].priority) child++;
        if (heap[child].priority >= last.priority) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
      return first;
    }
    costs[start] = 0;
    previous[start] = start;
    push({id:start,cost:0,priority:heuristic(start)});
    while (heap.length) {
      const {id,cost} = pop();
      if (cost !== costs[id]) continue;
      if (id === end) return previous;
      neighbors(id,(next,step) => {
        const total = cost + step;
        if (total >= costs[next]) return;
        costs[next] = total;
        previous[next] = id;
        push({id:next,cost:total,priority:total+heuristic(next)});
      });
    }
    return previous;
  }

  function detour(parent, child, grid, clear, avoidBranches = false, shortcut = clear) {
    const { step, cols, rows, cells } = grid;
    const start = Math.round(parent.y / step) * cols + Math.round(parent.x / step);
    const end = Math.round(child.y / step) * cols + Math.round(child.x / step);
    const minX = Math.max(Math.ceil(49 / step), Math.floor((Math.min(parent.x, child.x) - 160) / step));
    const maxX = Math.min(Math.floor(1151 / step), Math.ceil((Math.max(parent.x, child.x) + 160) / step));
    const minY = Math.max(Math.ceil(175 / step), Math.floor((Math.min(parent.y, child.y) - 160) / step));
    const maxY = Math.min(rows - 1, Math.floor(1407 / step), Math.ceil((Math.max(parent.y, child.y) + 160) / step));
    const weighted = avoidBranches === 'weighted';
    const crosses = index => grid.branches?.get(index)?.some(link => grid.activeBranch?.(link) !== false &&
      link.parent !== parent && link.child !== parent && link.parent !== child && link.child !== child);
    const open = index => {
      if (cells[index] && cells[index] !== parent.index + 1 && cells[index] !== child.index + 1) return false;
      return !avoidBranches || weighted || !crosses(index);
    };
    const steps = [[0,-1],[-1,0],[1,0],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    function neighbors(at, visit) {
      const x = at % cols, y = Math.floor(at / cols);
      for (const [dx, dy] of steps) {
        const nx = x + dx, ny = y + dy, next = ny * cols + nx;
        if (nx < minX || nx > maxX || ny < minY || ny > maxY || !open(next)) continue;
        if (dx && dy && (!open(at + dx) || !open(at + dy * cols))) continue;
        const penalty = weighted && (crosses(next) || (dx && dy && (crosses(at+dx) || crosses(at+dy*cols)))) ? 7 : 0;
        visit(next, (dx && dy ? Math.SQRT2 : 1) + penalty);
      }
    }
    let previous;
    if (weighted) previous = shortestWeightedPath(start,end,cols,cells.length,neighbors);
    else {
      previous = new Int32Array(cells.length).fill(-1);
      const queue = new Int32Array(cells.length);
      previous[start] = start;
      queue[0] = start;
      let tail = 1;
      for (let head=0;head<tail&&previous[end]===-1;head++) {
        const at = queue[head];
        neighbors(at,next => {
          if (previous[next] !== -1) return;
          previous[next] = at;
          queue[tail++] = next;
        });
      }
    }
    if (previous[end] === -1) return null;
    const points = [child];
    for (let cell = previous[end]; cell !== start; cell = previous[cell]) points.push({ x: cell % cols * step, y: Math.floor(cell / cols) * step });
    points.push(parent);
    points.reverse();
    const waypoints = [parent];
    for (let i = 0; i < points.length - 1;) {
      let next = points.length - 1;
      while (next > i+1 && !shortcut(points[i], points[next])) next--;
      if (!clear(points[i],points[next])) return null;
      waypoints.push(points[next]);
      i = next;
    }
    const samples = [parent];
    for (let i = 1; i < waypoints.length - 1; i++) {
      const a = waypoints[i - 1], b = waypoints[i], c = waypoints[i + 1];
      let rounded = false;
      for (const radius of [.46, .34, .2, .1]) {
        const pre = { x: mix(b.x, a.x, radius), y: mix(b.y, a.y, radius) };
        const post = { x: mix(b.x, c.x, radius), y: mix(b.y, c.y, radius) };
        const curve = Array.from({ length: 13 }, (_, k) => cubic(pre, b, b, post, k / 12));
        if (curve.every((p, k) => clear(k ? curve[k - 1] : samples.at(-1), p))) {
          samples.push(...curve);
          rounded = true;
          break;
        }
      }
      if (!rounded) samples.push(b);
    }
    samples.push(child);
    return samples.every((p, i) => !i || clear(samples[i - 1], p)) ? samples : waypoints;
  }

  function markBranch(grid, link) {
    const { step, cols, rows } = grid;
    grid.branches ??= new Map();
    for (let i = 1; i < link.samples.length; i++) {
      const a = link.samples[i - 1], b = link.samples[i];
      const count = Math.max(1, Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/(step*.4)));
      for (let k = 0; k <= count; k++) {
        const x = Math.round(mix(a.x,b.x,k/count)/step), y = Math.round(mix(a.y,b.y,k/count)/step);
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const cell = y*cols+x;
        if (!grid.branches.has(cell)) grid.branches.set(cell,[]);
        const occupants = grid.branches.get(cell);
        if (occupants.at(-1) !== link) occupants.push(link);
      }
    }
  }

  function route(parent, child, nodes, grid, fineGrid, branches, avoidBranches) {
    const dx = child.x - parent.x, dy = child.y - parent.y;
    const distance = Math.hypot(dx, dy) || 1;
    const vx = -dy / distance, vy = dx / distance;
    const nearby = nodes.filter(n => n !== parent && n !== child &&
      n.x + n.w / 2 > Math.min(parent.x, child.x) - 100 && n.x - n.w / 2 < Math.max(parent.x, child.x) + 100 &&
      n.y + n.h / 2 > Math.min(parent.y, child.y) - 100 && n.y - n.h / 2 < Math.max(parent.y, child.y) + 100);
    let best;
    function consider(samples) {
      const hits = nearby.filter(n => samples.some(s => Math.abs(s.x - n.x) < n.w / 2 + 2 && Math.abs(s.y - n.y) < n.h / 2 + 2)).length;
      if (best && hits > best.hits) return false;
      const crossings = hits ? Infinity : branches.intersections(samples, parent, child).size;
      if (!best || hits < best.hits || crossings < best.crossings) best = { samples, hits, crossings };
      return !hits && !crossings;
    }
    if (child.corridor) {
      const samples = [parent, ...child.corridor, child];
      if (consider(samples)) return best;
    }
    for (const bend of [0, 12, -12, 24, -24, 42, -42, 65, -65, 88, -88]) {
      const p = { x: parent.x + dx * .13 + vx * bend, y: parent.y + dy * .48 + vy * bend };
      const q = { x: parent.x + dx * .82 + vx * bend, y: child.y - dy * .22 + vy * bend };
      const count = Math.max(24, Math.ceil(distance / 5));
      const samples = Array.from({ length: count + 1 }, (_, i) => cubic(parent, p, q, child, i / count));
      if (consider(samples)) break;
    }
    if (!best.hits && (!avoidBranches || !best.crossings)) return best;
    const obstacles = nodes.filter(node => node !== parent && node !== child);
    const clear = (a, b) => {
      const limit = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 2));
      const candidates = obstacles.filter(n => n.x + n.w / 2 + 1 > Math.min(a.x,b.x) && n.x - n.w / 2 - 1 < Math.max(a.x,b.x) &&
        n.y + n.h / 2 + 1 > Math.min(a.y,b.y) && n.y - n.h / 2 - 1 < Math.max(a.y,b.y));
      for (let i = 0; i <= limit; i++) if (candidates.some(n => Math.abs(mix(a.x,b.x,i/limit)-n.x) < n.w/2+1 && Math.abs(mix(a.y,b.y,i/limit)-n.y) < n.h/2+1)) return false;
      return true;
    };
    if (avoidBranches) {
      const safe = (a,b) => clear(a,b) && !branches.intersections([a,b],parent,child).size;
      const alternative = avoidBranches === 'weighted'
        ? detour(parent,child,grid,clear,'weighted',safe)
        : detour(parent,child,grid,safe,true);
      if (alternative) {
        const length = alternative.reduce((sum,p,i) => i ? sum+Math.hypot(p.x-alternative[i-1].x,p.y-alternative[i-1].y) : sum,0);
        if (length <= distance*2.1+20) return { samples: alternative, hits: 0 };
      }
    }
    if (!best.hits) return best;
    const samples = detour(parent, child, grid, clear) || detour(parent, child, fineGrid(), clear);
    return samples ? { samples, hits: 0 } : best;
  }

  function branchIndex() {
    const grid = new Map();
    const active = new Set();
    const orient = (a,b,c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    function buckets(a, b) {
      const keys = [];
      for (let x = Math.floor(Math.min(a.x,b.x)/42); x <= Math.floor(Math.max(a.x,b.x)/42); x++) {
        for (let y = Math.floor(Math.min(a.y,b.y)/42); y <= Math.floor(Math.max(a.y,b.y)/42); y++) keys.push(`${x}:${y}`);
      }
      return keys;
    }
    function intersections(samples, parent, child) {
      const matches = new Set();
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        for (const key of buckets(a,b)) for (const other of grid.get(key) || []) {
          const link = other.link;
          if (!active.has(link)) continue;
          if (link.parent === parent || link.child === parent || link.parent === child || link.child === child || matches.has(link)) continue;
          if (orient(a,b,other.a)*orient(a,b,other.b)<-1e-6 && orient(other.a,other.b,a)*orient(other.a,other.b,b)<-1e-6) matches.add(link);
        }
      }
      return matches;
    }
    function add(link) {
      active.add(link);
      for (let i = 1; i < link.samples.length; i++) {
        const a = link.samples[i-1], b = link.samples[i];
        const segment = { a,b,link };
        for (const key of buckets(a,b)) {
          if (!grid.has(key)) grid.set(key,[]);
          grid.get(key).push(segment);
        }
      }
    }
    return { intersections, add, has: link => active.has(link), remove: link => active.delete(link) };
  }

  function refineBranches(links, nodes, grid, fineGrid, branches, weighted = false, finish = false) {
    if (weighted) {
      grid.activeBranch = branches.has;
      for (const link of links) markBranch(grid, link);
    }
    const candidates = links.map((link,index) => ({index, crossings:branches.intersections(link.samples,link.parent,link.child).size}));
    candidates.sort((a,b) => b.crossings-a.crossings || a.index-b.index);
    for (const {index} of candidates.slice(0,weighted ? 160 : 60)) {
      const original = links[index];
      const {parent,child} = original;
      const crossings = branches.intersections(original.samples,parent,child).size;
      if (crossings < (finish ? 1 : 2)) continue;
      const revised = {parent,child,...route(parent,child,nodes,grid,fineGrid,branches,weighted && !finish ? 'weighted' : true)};
      if (revised.hits > original.hits || branches.intersections(revised.samples,parent,child).size >= crossings) continue;
      const length = samples => samples.reduce((sum,p,i)=>i ? sum+Math.hypot(p.x-samples[i-1].x,p.y-samples[i-1].y) : sum,0);
      if (weighted && length(revised.samples) > length(original.samples)*(finish ? 1.55 : 1.2)+10) continue;
      branches.remove(original);
      branches.add(revised);
      if (weighted) markBranch(grid, revised);
      links[index] = revised;
    }
  }

  function packCrown(root, weights, corridors, distributed) {
    function warp(point) {
      const u = (point.x - 600) / 540, v = (point.y - 745) / 540;
      return { x: 600 + u * 530 * Math.sqrt(Math.max(0, 1 - v*v/2)),
        y: 758 + v * 565 * Math.sqrt(Math.max(0, 1 - u*u/2)) };
    }
    function place(node, box, parent, entry = 'bottom') {
      const horizontal = box.w / box.h < (distributed ? .88 : .96) && box.w > node.w + 45;
      const towardsRight = corridors && entry !== 'bottom' ? entry === 'left' : box.x + box.w / 2 >= 600;
      const gutter = distributed ? .22 : .28;
      const depth = node.children.length ? (horizontal ? Math.min(box.w * gutter, node.w + 22) : Math.min(box.h * gutter, node.h + 24)) : 0;
      const centerX = box.x + box.w / 2, centerY = box.y + box.h / 2;
      let childrenBox;
      if (horizontal) {
        node.x = towardsRight ? box.x + depth / 2 : box.x + box.w - depth / 2;
        node.y = mix(centerY, Math.max(box.y + node.h / 2, Math.min(box.y + box.h - node.h / 2, parent?.y ?? centerY)), .42);
        if (corridors && entry === 'bottom') node.y = box.y + box.h - Math.min(box.h*.33, node.h*.7 + 7);
        childrenBox = { x: towardsRight ? box.x + depth : box.x, y: box.y, w: box.w - depth, h: box.h };
      } else {
        node.x = centerX;
        node.y = box.y + box.h - depth / 2;
        if (corridors && entry !== 'bottom') node.x = entry === 'left'
          ? box.x + Math.min(box.w*.4,node.w*.69+7) : box.x + box.w - Math.min(box.w*.4,node.w*.69+7);
        childrenBox = { ...box, h: box.h - depth };
      }
      if (!node.children.length) {
        node.x = centerX + (noise(node.index) - .5) * Math.min(15, box.w * .2);
        node.y = centerY + (noise(node.index + 21) - .5) * Math.min(19, box.h * .26);
        return;
      }
      const total = node.children.reduce((sum, child) => sum + weights.get(child), 0);
      let cursor = horizontal ? childrenBox.y : childrenBox.x;
      for (const child of node.children) {
        const span = (horizontal ? childrenBox.h : childrenBox.w) * weights.get(child) / total;
        const zone = horizontal ? { ...childrenBox, y: cursor, h: span } : { ...childrenBox, x: cursor, w: span };
        place(child, zone, node, horizontal ? towardsRight ? 'left' : 'right' : 'bottom');
        if (corridors) {
          const crossing = horizontal ? { x: towardsRight ? zone.x : zone.x + zone.w, y: child.y } : { x: child.x, y: zone.y + zone.h };
          const a = horizontal ? { x: mix(node.x,crossing.x,.76), y: node.y } : { x: node.x, y: mix(node.y,crossing.y,.76) };
          const b = horizontal ? { x: mix(node.x,crossing.x,.31), y: crossing.y } : { x: crossing.x, y: mix(node.y,crossing.y,.31) };
          child.corridor = Array.from({length:25}, (_,i) => warp(cubic(node,a,b,crossing,i/24)));
          const distance = Math.hypot(child.x-crossing.x,child.y-crossing.y);
          for (let i=1, count=Math.ceil(distance/4);i<count;i++) child.corridor.push(warp({x:mix(crossing.x,child.x,i/count),y:mix(crossing.y,child.y,i/count)}));
        }
        cursor += span;
      }
    }
    place(root, { x: 60, y: 205, w: 1080, h: 1080 }, null);
    for (const node of [root, ...descendants(root)]) {
      Object.assign(node, warp(node));
      contain(node);
    }
    root.x = 600; root.y = 1225;
  }

  function* descendants(node) {
    for (const child of node.children) { yield child; yield* descendants(child); }
  }

  // Measure the required subtree rectangles bottom-up. No fixed crown, shrink,
  // or post-layout relaxation: each family's reserved space stays with it.
  function growingCrown(root, nodes, font, paper, engraved) {
    const pad = 8, gap = 14, lane = 34;
    const cache = new Map();
    const aspects=[.2,.4,.7,1,1.5,2.5,5];
    function plan(node, entry, hand, target=1) {
      target=aspects.reduce((a,b)=>Math.abs(Math.log(a/target))<Math.abs(Math.log(b/target))?a:b);
      const key = `${node.index}:${entry}:${hand}:${target}`;
      if (cache.has(key)) return cache.get(key);
      if (!node.children.length) {
        const result = { node, w: node.w + pad*2, h: node.h + pad*2,
          x: node.w/2+pad, y: node.h/2+pad, children: [], axis: entry };
        cache.set(key,result); return result;
      }
      const options = [];
      for (const axis of entry === 'bottom' ? ['bottom',hand] : [entry,'bottom']) {
        const vertical = axis === 'bottom';
        const children = node.children.map((child,i) => plan(child,axis,
          node === root ? i < node.children.length/2 ? 'right' : 'left' : hand,
          target*(vertical?1/node.children.length:node.children.length)));
        const total = children.reduce((sum,c)=>sum+(vertical?c.w:c.h),0)+gap*(children.length-1);
        const cross = Math.max(...children.map(c=>vertical?c.h:c.w));
        const w = vertical ? Math.max(node.w+pad*2,total) : node.w+pad*2+lane+cross;
        const h = vertical ? node.h+pad*2+lane+cross : Math.max(node.h+pad*2,total);
        const x = vertical ? entry==='left' ? pad+node.w/2 : entry==='right' ? w-pad-node.w/2 : w/2
          : axis==='left' ? pad+node.w/2 : w-pad-node.w/2;
        const y = vertical || entry==='bottom' ? h-pad-node.h/2 : h/2;
        let cursor = ((vertical?w:h)-total)/2;
        const placements = children.map(child => {
          const offset = vertical ? {x:cursor,y:cross-child.h}
            : {x:axis==='left'?w-cross:cross-child.w,y:cursor};
          cursor += (vertical?child.w:child.h)+gap;
          return {plan:child,...offset};
        });
        // The entry side must remain open. A wide family receives a wider box;
        // a deep family receives more height, instead of displacing its cousins.
        options.push({node,w,h,x,y,axis,children:placements,
          cost:w*h+.32*(w*w/target+h*h*target)});
      }
      if(node===root && node.children.length>1) {
        // Split only at an existing sibling boundary. Both sides grow to fit
        // their descendants; the trunk stays between the actual family regions.
        const left=node.children.map(c=>plan(c,'right','right',node.children.length*.4));
        const right=node.children.map(c=>plan(c,'left','left',node.children.length*.4));
        for(let cut=1;cut<node.children.length;cut++) {
          const groups=[left.slice(0,cut),right.slice(cut)];
          const sizes=groups.map(list=>({w:Math.max(...list.map(c=>c.w)),h:list.reduce((s,c)=>s+c.h,0)+gap*(list.length-1)}));
          const w=sizes[0].w+sizes[1].w+node.w+pad*2+lane*2;
          const topHeight=Math.max(sizes[0].h,sizes[1].h);
          const h=topHeight+node.h+pad*2+lane;
          const x=sizes[0].w+lane+pad+node.w/2, y=h-pad-node.h/2;
          const children=[];
          groups.forEach((list,side)=>{
            let cursor=(topHeight-sizes[side].h)/2;
            for(const child of list) {
              children.push({plan:child,x:side?w-sizes[1].w:sizes[0].w-child.w,y:cursor,axis:side?'left':'right'});
              cursor+=child.h+gap;
            }
          });
          options.push({node,w,h,x,y,axis:'split',children,cost:w*h+.32*(w*w/target+h*h*target)});
        }
      }
      if(node.children.length>=7 && node.children.every(c=>c.children.length===0)) {
        // A botanical fan shares wood, not genealogy: each complete link still
        // starts at this actual parent. Unlabelled junctions are not people.
        const leaves=node.children.map(c=>plan(c,'bottom',hand,target));
        const leafW=leaves.reduce((s,c)=>s+c.w,0)/leaves.length,leafH=leaves.reduce((s,c)=>s+c.h,0)/leaves.length;
        const stemGap=30,rowH=leafH+18,colW=leafW*2+stemGap;
        const cols=Math.max(1,Math.round(Math.sqrt(leaves.length*rowH*Math.min(1.4,Math.max(.7,target))/(2*colW))));
        const perCol=Math.ceil(leaves.length/cols);
        const columns=[];
        for(let from=0;from<leaves.length;from+=perCol) {
          const members=leaves.slice(from,from+perCol),rows=[];
          for(let j=0;j<members.length;j+=2)rows.push({members:members.slice(j,j+2),h:Math.max(...members.slice(j,j+2).map(c=>c.h))+18});
          const left=Math.max(...members.filter((_,i)=>i%2===0).map(c=>c.w)),right=Math.max(0,...members.filter((_,i)=>i%2===1).map(c=>c.w));
          columns.push({rows,left,w:left+right+stemGap,h:rows.reduce((s,r)=>s+r.h,0)});
        }
        const lift=columns.length>1?rowH*1.5:0;
        const contentW=columns.reduce((s,c)=>s+c.w,0)+(columns.length-1)*gap;
        const w=Math.max(node.w+pad*2,contentW);
        const tallest=Math.max(...columns.map(c=>c.h)),canopyH=tallest+lift;
        const h=canopyH+node.h+pad*2+lane;
        const x=entry==='left'?pad+node.w/2:entry==='right'?w-pad-node.w/2:w/2;
        const y=h-pad-node.h/2;
        const children=[];let columnX=(w-contentW)/2;
        columns.forEach((column,i)=>{
          const spineX=columnX+column.left+stemGap/2;
          let rowY=(tallest-column.h)/2+(columns.length===1?0:lift*Math.pow((i-(columns.length-1)/2)/Math.max(1,(columns.length-1)/2),2));
          for(const row of column.rows) {
            row.members.forEach((child,j)=>{
              const side=j===0?-1:1;
              children.push({plan:child,x:spineX+(side<0?-stemGap/2-child.w:stemGap/2),
                y:rowY+(row.h-18-child.h)/2,vine:{spineX,baseY:canopyH+lane*.4,rise:row.h*.22,side}});
            });
            rowY+=row.h;
          }
          columnX+=column.w+gap;
        });
        options.push({node,w,h,x,y,axis:'bouquet',children,cost:w*h+.32*(w*w/target+h*h*target)});
      }
      const choices=node===root?options.filter(p=>p.axis==='split'||p.axis==='bottom'||p.axis==='bouquet'):options;
      const result=choices.reduce((a,b)=>a.cost<=b.cost?a:b);
      cache.set(key,result); return result;
    }
    const tree = plan(root,'bottom','left',engraved?.76:1);
    let boardWidth = Math.max(1200,tree.w/.86);
    let boardHeight = Math.max(1200,(tree.h+40)/.64);
    const ox = (boardWidth-tree.w)/2, oy = boardHeight*.14;
    const links = [];
    function place(block,x,y) {
      const parent = block.node;
      parent.x=x+block.x; parent.y=y+block.y;
      parent.region={x,y,width:block.w,height:block.h};
      for (const item of block.children) place(item.plan,x+item.x,y+item.y);
      for (const item of block.children) {
        const child=item.plan.node;
        if(item.vine) {
          const {spineX,baseY,rise,side}=item.vine;
          child.leafFacing=side;
          const base={x:x+spineX,y:y+baseY};
          const join={x:base.x,y:child.y+rise};
          const samples=[];
          const append=(p,a,b,q)=>{
            const length=Math.hypot(a.x-p.x,a.y-p.y)+Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(q.x-b.x,q.y-b.y);
            const count=Math.max(12,Math.ceil(length/4));
            for(let i=samples.length?1:0;i<=count;i++)samples.push(cubic(p,a,b,q,i/count));
          };
          append(parent,{x:parent.x,y:mix(parent.y,base.y,.5)},{x:base.x,y:mix(parent.y,base.y,.8)},base);
          append(base,base,join,join);
          append(join,{x:join.x,y:child.y},{x:mix(join.x,child.x,.6),y:child.y},child);
          links.push({parent,child,samples,hits:0});
          continue;
        }
        // Curve only in the parent's reserved lane, then enter the child's
        // reserved port straight. No route through a neighbouring subtree.
        const axis=item.axis||block.axis;
        const vertical=axis==='bottom';
        const portal=vertical ? {x:child.x,y:y+item.y+item.plan.h}
          : {x:x+item.x+(axis==='right'?item.plan.w:0),y:child.y};
        const a=vertical ? {x:parent.x,y:mix(parent.y,portal.y,.56)}
          : {x:mix(parent.x,portal.x,.56),y:parent.y};
        const b=vertical ? {x:portal.x,y:mix(parent.y,portal.y,.78)}
          : {x:mix(parent.x,portal.x,.78),y:portal.y};
        const count=Math.max(24,Math.ceil((Math.hypot(portal.x-parent.x,portal.y-parent.y))/4));
        const samples=Array.from({length:count+1},(_,i)=>cubic(parent,a,b,portal,i/count));
        const tail=Math.max(1,Math.ceil(Math.hypot(child.x-portal.x,child.y-portal.y)/4));
        for(let i=1;i<=tail;i++) samples.push({x:mix(portal.x,child.x,i/tail),y:mix(portal.y,child.y,i/tail)});
        links.push({parent,child,samples,hits:0});
      }
    }
    place(tree,ox,oy);
    if(engraved){
      for(const link of links)link.width=Math.min(42,3.5+Math.sqrt(link.child.descendantCount+1)*2.25);
    }
    // Bend corridors, branches and labels together so the crown has a rounded
    // silhouette and the long limbs sweep outward instead of forming rows.
    const center={x:ox+tree.w/2,y:oy+tree.h/2};
    const curvature=(engraved?.58:.38)*Math.min(tree.w/tree.h,tree.h/tree.w);
    const warp=p=>{
      const u=(p.x-center.x)/(tree.w/2),v=(p.y-center.y)/(tree.h/2);
      const span = Math.min(tree.w, tree.h);
      const sway = Math.sin(Math.PI * v) * span * .019;
      const lift = span * .052 * (1-u*u) * (1-v) / 2;
      const ripple = span * .008 * Math.sin(u * 7 + v * 2) * (1-v*v);
      return {x:center.x+(p.x-center.x)*Math.sqrt(1-v*v*curvature)+sway,
        y:center.y+(p.y-center.y)*Math.sqrt(1-u*u*curvature)-lift+ripple};
    };
    for(const link of links) link.samples=link.samples.map(warp);
    for(const node of nodes) Object.assign(node,warp(node));
    for (const { child, samples } of links) {
      if (child.children.length) continue;
      const end = samples.at(-1);
      const stem = samples.at(-Math.min(9, samples.length));
      const dx = end.x - stem.x;
      child.leafFacing = dx < 0 ? -1 : 1;
    }
    // The oval map compresses the outer corners. Expand geometry, never text,
    // until the original measured label envelopes are clear again.
    const positions=nodes.map(n=>({x:n.x,y:n.y}));
    const paths=links.map(l=>l.samples);
    let expansion=1;
    function labelHits(stroke) {
      const cell=128,padding=stroke?74:2,buckets=new Map();
      for(const n of nodes)for(let x=Math.floor((n.x-n.w/2-padding)/cell);x<=Math.floor((n.x+n.w/2+padding)/cell);x++)
        for(let y=Math.floor((n.y-n.h/2-padding)/cell);y<=Math.floor((n.y+n.h/2+padding)/cell);y++) {
          const key=`${x}:${y}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(n);
        }
      return l=>{
        const hits=new Set();
        const start=l.width??branchWidth(l.child),end=Math.max(1.7,start*.48);
        for(const [i,p] of l.samples.entries())for(const n of buckets.get(`${Math.floor(p.x/cell)}:${Math.floor(p.y/cell)}`)||[]) {
          if(n===l.parent||n===l.child||hits.has(n))continue;
          const clearance=stroke?4+mix(start,end,i/(l.samples.length-1))/2:2;
          if(Math.abs(p.x-n.x)<n.w/2+clearance&&Math.abs(p.y-n.y)<n.h/2+clearance)hits.add(n);
        }
        return hits.size;
      };
    }
    const conflicts=()=>{
      if(nodes.some((n,i)=>nodes.slice(i+1).some(m=>!separates(n,m,4))))return true;
      const hits=labelHits(true);return links.some(l=>hits(l)>0);
    };
    while(conflicts() && expansion<2.5) {
      expansion+=.15;
      nodes.forEach((n,i)=>Object.assign(n,{x:positions[i].x*expansion,y:positions[i].y*expansion}));
      links.forEach((l,i)=>{l.samples=paths[i].map(p=>({x:p.x*expansion,y:p.y*expansion}));});
    }
    if(conflicts()) throw new RangeError('تعذر فصل جميع الأغصان والأسماء في التوزيع المتسع. لم تتغير بيانات الشجرة.');
    boardWidth*=expansion; boardHeight*=expansion;
    if(engraved) bendCorridors(links,labelHits(true));
    // Preserve the exported relationship order independently of traversal.
    const order=new Map(nodes.flatMap(n=>n.children.map(c=>[c.personId,0])).map(([id],i)=>[id,i]));
    links.sort((a,b)=>order.get(a.child.personId)-order.get(b.child.personId));
    const groups=new Map();
    for(const link of links) {if(!groups.has(link.parent))groups.set(link.parent,[]);groups.get(link.parent).push(link);}
    let branchCrossings=0;
    if(groups.size>1) {
      const branches=branchIndex();for(const link of links)branches.add(link);
      const largest=[...groups.values()].reduce((a,b)=>a.length>b.length?a:b);
      const dominant=largest.length>links.length/2?largest[0].parent:null;
      const otherBranches=dominant?branchIndex():branches;
      if(dominant)for(const link of links)if(link.parent!==dominant)otherBranches.add(link);
      branchCrossings=links.reduce((sum,l)=>sum+(l.parent===dominant?otherBranches:branches).intersections(l.samples,l.parent,l.child).size,0)/2;
    }
    let collisions=0;
    for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) if(!separates(nodes[i],nodes[j],0)) collisions++;
    const hits=labelHits(false);
    for(const link of links) link.hits=hits(link);
    return {root,nodes,links,font,boardWidth,boardHeight,style:engraved?'engraved-crown':'growing',collisions,
      maxDepth:Math.max(...nodes.map(n=>n.generation)),
      minimumPt:font*Math.min(paper.width/boardWidth,paper.height/boardHeight)*72/25.4,
      obstructedBranches:links.filter(l=>l.hits).length,
      branchCrossings};
  }

  function bendCorridors(links, labelHits) {
    const branches=branchIndex();
    for(const link of links)branches.add(link);
    for(const [index,link] of links.entries()){
      const distance=[0];
      for(let i=1;i<link.samples.length;i++){
        const a=link.samples[i-1],b=link.samples[i];
        distance.push(distance[i-1]+Math.hypot(b.x-a.x,b.y-a.y));
      }
      const length=distance.at(-1);
      if(length<38)continue;
      const amplitude=Math.min(45,length*.115)*(index%2?1:-1);
      const existing=branches.intersections(link.samples,link.parent,link.child);
      for(const factor of [1,.55,.28]){
        const samples=link.samples.map((point,i,points)=>{
          if(i===0||i===points.length-1)return point;
          const t=distance[i]/length;
          const dx=points[i+1].x-points[i-1].x,dy=points[i+1].y-points[i-1].y;
          const bend=Math.sin(Math.PI*t)**2 * (1+.45*Math.cos(3*Math.PI*t)) *
            amplitude*factor/(Math.hypot(dx,dy)||1);
          return {x:point.x-dy*bend,y:point.y+dx*bend};
        });
        const revised={...link,samples};
        if(labelHits(revised)||[...branches.intersections(samples,link.parent,link.child)].some(other=>!existing.has(other)))continue;
        branches.remove(link);
        branches.add(revised);
        links[index]=revised;
        break;
      }
    }
  }

  function sectorCrown(root, nodes, paper, measure) {
    const rings = [];
    const leaves = new Map();
    function weigh(node) {
      const total = node.children.reduce((sum, child) => sum + weigh(child), 0) || 1;
      leaves.set(node, total);
      return total;
    }
    function assign(node, from, to) {
      node.angle = (from + to) / 2;
      node.arcShare = to - from;
      (rings[node.generation] ??= []).push(node);
      let edge = from;
      for (const child of node.children) {
        const next = edge + (to - from) * leaves.get(child) / leaves.get(node);
        assign(child, edge, next);
        edge = next;
      }
    }
    weigh(root);
    assign(root, -1.54, 1.54);
    const boardWidth = paper.width;
    const boardHeight = paper.height;
    const rx = boardWidth * .441, ry = boardHeight * .646;
    const depth = Math.max(1, rings.length - 1);
    root.x = boardWidth / 2;
    root.y = boardHeight * .79;
    const point = (progress, angle) => ({
      x: root.x + Math.sin(angle) * rx * progress,
      y: root.y - Math.cos(angle) * ry * progress
    });
    for (const node of nodes) {
      const progress = node.generation / depth;
      Object.assign(node, point(progress, node.angle));
      const arc = progress * node.arcShare *
        Math.hypot(rx * Math.cos(node.angle), ry * Math.sin(node.angle));
      const targetWidth = Math.min(29, Math.max(12, arc * .77));
      node.font = node === root ? 4.2 : Math.max(8 * 25.4 / 72, Math.min(3.45, targetWidth / 8.8));
      const measured = text => measure(text, node.font);
      const lines = wrap(node.fullName, targetWidth - 4, measured);
      node.lines = lines.length <= 2 ? lines : [
        lines.slice(0, Math.ceil(lines.length / 2)).join(' '),
        lines.slice(Math.ceil(lines.length / 2)).join(' ')
      ];
      node.shapeWidth = Math.max(11, Math.max(...node.lines.map(measured)) * 1.19 + 3);
      node.shapeHeight = Math.max(7.5, node.lines.length * node.font * 1.18 + 3.2);
      if (!node.children.length && node !== root) {
        const axis = Math.atan2(-ry * Math.cos(node.angle), rx * Math.sin(node.angle)) * 180 / Math.PI;
        node.leafFacing = axis < -90 ? -1 : 1;
        node.tilt = axis < -90 ? axis + 180 : axis;
      } else node.tilt = 0;
      const turn = Math.abs(node.tilt) * Math.PI / 180;
      node.w = node.shapeWidth * Math.cos(turn) + node.shapeHeight * Math.sin(turn);
      node.h = node.shapeWidth * Math.sin(turn) + node.shapeHeight * Math.cos(turn);
    }
    const links = nodes.flatMap(parent => parent.children.map((child, i) => {
      const start = parent.generation / depth, end = child.generation / depth;
      const samples = Array.from({length: 65}, (_, index) => {
        const t = index / 64;
        // Turn between the labels and travel straight close to each ring.
        const phase = Math.max(0, Math.min(1, (t - .3) / .4));
        const angle = parent === root ? child.angle :
          mix(parent.angle, child.angle, phase * phase * (3 - 2 * phase));
        const p = point(mix(start, end, t), angle);
        if (parent === root) {
          // Keep the real parent endpoint, but expose the branches at different heights.
          const height = Math.min(13, i * 3);
          const offset = t < .28 ? Math.sin(Math.PI * t / .28) * height : 0;
          p.y -= offset;
        }
        return p;
      });
      const hits = nodes.some(n => n !== parent && n !== child &&
        samples.some(p => Math.abs(n.x - p.x) < n.w / 2 && Math.abs(n.y - p.y) < n.h / 2));
      return { parent, child, samples, hits, width: 1.6 + 9 * Math.sqrt(leaves.get(child) / leaves.get(root)) };
    }));
    const index = branchIndex();
    let branchCrossings = 0;
    for (const link of links) {
      branchCrossings += index.intersections(link.samples, link.parent, link.child).size;
      index.add(link);
    }
    const font = Math.min(...nodes.map(n => n.font));
    return { root, nodes, links, font, boardWidth, boardHeight, style: 'sector',
      collisions: nodes.reduce((count, a, i) => count + nodes.slice(i + 1).filter(b => !separates(a, b, 0)).length, 0),
      maxDepth: rings.length - 1, branchCrossings,
      obstructedBranches: links.filter(link => link.hits).length,
      minimumPt: font * Math.min(paper.width / boardWidth, paper.height / boardHeight) * 72 / 25.4 };
  }

  function ribbonContacts(links) {
    const made = links.map(link => {
      const {outline}=ribbonOutline(link);
      return {link,outline,left:Math.min(...outline.map(p=>p.x)),right:Math.max(...outline.map(p=>p.x)),
        top:Math.min(...outline.map(p=>p.y)),bottom:Math.max(...outline.map(p=>p.y))};
    });
    const touches = (a,b) => {
      const min = (p,q,k) => Math.min(p[k],q[k]);
      const max = (p,q,k) => Math.max(p[k],q[k]);
      const side = (p,q,r) => (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
      for (let i=0;i<a.length;i++) {
        const p=a[i],q=a[(i+1)%a.length];
        for (let j=0;j<b.length;j++) {
          const r=b[j],s=b[(j+1)%b.length];
          if (max(p,q,'x')<min(r,s,'x')||max(r,s,'x')<min(p,q,'x')||
              max(p,q,'y')<min(r,s,'y')||max(r,s,'y')<min(p,q,'y')) continue;
          if (side(p,q,r)*side(p,q,s)<=0 && side(r,s,p)*side(r,s,q)<=0) return true;
        }
      }
      return false;
    };
    let count = 0;
    for (let i=0;i<made.length;i++) for (let j=i+1;j<made.length;j++) {
      const a=made[i], b=made[j];
      if(a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top) continue;
      if ([a.link.parent,a.link.child].some(n=>n===b.link.parent||n===b.link.child)) continue;
      if (touches(a.outline,b.outline)) count++;
    }
    return count;
  }

  function layout(doc, paper, measure, style, retryPt, arcFactor, stagger = true) {
    if(style==='engraved-crown'){
      const count=core.visible(doc).nodes.length;
      if(count<=80)return {...layout(doc,paper,measure,'organic-improved'),style:'engraved-crown'};
      try{return layout(doc,paper,measure,'engraved-layout');}
      catch(error){
        if(!(error instanceof RangeError))throw error;
        return {...layout(doc,paper,measure,'growing'),style:'engraved-crown'};
      }
    }
    if (style === 'organic-improved' && arcFactor === undefined) {
      let best;
      const score = r => r.collisions*1e6 + r.obstructedBranches*1e4 + r.branchCrossings*100 + (r.ribbonContacts??0);
      for (const useStagger of [true,false]) {
        for (const size of [37,34,undefined]) {
          for (const factor of size===undefined ? [.65,.63,.67,.61,.69,.59,.71] : [.65,.63,.67]) {
            const candidate = layout(doc,paper,measure,style,retryPt??size,factor,useStagger);
            if (candidate.nodes.length > 80) return layout(doc,paper,measure,style,retryPt,.65);
            if (!best || score(candidate)<score(best) ||
                (score(candidate)===score(best)&&candidate.font>best.font)) best=candidate;
            if (score(best)===0 && (size===undefined ||
                best.minimumPt>=size*Math.min(paper.width/700,paper.height/(700*height/width))-.05)) return best;
          }
        }
      }
      return best;
    }
    const { root, nodes } = core.visible(doc);
    style = style || 'growing';
    const engraved=style==='engraved-layout';
    const improved = style === 'organic-improved';
    const staggerLeaves = improved && stagger;
    if (improved) style = 'organic';
    if (style === 'sector') return sectorCrown(root, nodes, paper, measure);
    if (style === 'weighted') {
      if (nodes.length <= 40) return layout(doc,paper,measure,'crown');
      const previous = layout(doc,paper,measure,'packed');
      const revised = layout(doc,paper,measure,'distributed');
      const base = revised.collisions <= previous.collisions && revised.obstructedBranches <= previous.obstructedBranches &&
        revised.branchCrossings < previous.branchCrossings ? revised : previous;
      const grid = branchGrid(base.nodes), branches = branchIndex();
      let preciseGrid;
      for (const link of base.links) branches.add(link);
      refineBranches(base.links,base.nodes,grid,()=>preciseGrid ??= branchGrid(base.nodes,3),branches,true);
      return {...base, style:'weighted', placement:base.style,
        branchCrossings: base.links.reduce((sum,link)=>sum+branches.intersections(link.samples,link.parent,link.child).size,0)/2,
        obstructedBranches:base.links.filter(link=>link.hits).length};
    }
    const maxDepth = Math.max(...nodes.map(node => node.generation));
    const scale = Math.min(paper.width / width, paper.height / height);
    const targets = [[30,26.45],[150,17.36],[280,13.6],[500,10.42]];
    let targetPt = targets[0][1];
    for (let i = 1; i < targets.length; i++) {
      const [from, high] = targets[i-1], [to, low] = targets[i];
      if (nodes.length <= from) break;
      targetPt = mix(high, low, Math.min(1, (nodes.length - from) / (to - from)));
    }
    targetPt = retryPt ?? targetPt;
    // Lettering is sized on the artboard. Paper only converts those units to points.
    const font = style === 'growing' || engraved ? 16 : targetPt * 25.4 / (72 * (700 / width));
    for (const [index, node] of nodes.entries()) {
      node.index = index;
      const lettering=(style==='growing'||engraved) && node.generation===0 ? font*Math.max(1.6,Math.sqrt(nodes.length)/6) : font;
      node.font=lettering;
      const measured=text=>measure(text,lettering);
      node.lines = wrap(node.fullName, lettering * 10, measured);
      node.w = Math.max(...node.lines.map(measured)) * 1.19 + lettering * 1.2;
      node.h = Math.max(lettering * 2, node.lines.length * lettering * 1.16 + lettering * .85);
      if (!node.children.length) {
        node.w += font * .8;
        node.h = nodes.length > 350 ? node.h + font*.45 : Math.max(node.h + font*.65, node.w*.40);
      } else if (nodes.length <= 350) node.h = Math.max(node.h, Math.min(node.w*.53,font*3.6));
      if (node.generation === 0) { node.w += font * 2; node.h += font * .55; }
      node.shapeWidth = node.w;
      node.shapeHeight = node.h;
      node.tilt = !node.children.length && node.generation ? (noise(index + 78) - .5) * (nodes.length > 180 ? 17 : 28) : 0;
      const angle = Math.abs(node.tilt) * Math.PI / 180;
      node.w = node.shapeWidth * Math.cos(angle) + node.shapeHeight * Math.sin(angle);
      node.h = node.shapeHeight * Math.cos(angle) + node.shapeWidth * Math.sin(angle);
      if (style !== 'growing' && !engraved && (node.w > 1030 || node.h > 580)) throw Error('اسم طويل لا يتسع على هذا المقاس. اختر ورقًا أكبر.');
    }
    if (style === 'growing'||engraved) return growingCrown(root,nodes,font,paper,engraved);
    root.x = 600; root.y = 1225;
    const weights = new Map();
    const meanArea = nodes.reduce((sum,node) => sum+node.w*node.h,0)/nodes.length;
    function weight(node) {
      const own = style === 'distributed' ? .46+.54*node.w*node.h/meanArea : 1;
      const value = own + node.children.reduce((sum, child) => sum + weight(child), 0);
      weights.set(node, value);
      return value;
    }
    weight(root);
    function seed(parent, from, to) {
      const sizes = parent.children.map(child => weights.get(child) + 1.4);
      const total = sizes.reduce((sum, value) => sum + value, 0);
      let start = from;
      for (const [index, child] of parent.children.entries()) {
        const end = start + (to - from) * sizes[index] / total;
        const angle = (start + end) / 2;
        const jitter = noise(child.index);
        // Improved distribution: leaves sit on a near-uniform outer ring by
        // generation (not random radial jitter), internal nodes ease outward
        // with sqrt-like progress so branching stays visible along the limb.
        const progress = child.children.length
          ? Math.pow(child.generation / Math.max(1, maxDepth), .84) * .81
          : staggerLeaves ? .84 + .13 * (child.generation / Math.max(1, maxDepth)) : .68 + jitter * .29;
        const tipX = crown.x + Math.sin(angle) * crown.rx;
        const tipY = crown.y - Math.cos(angle) * crown.ry;
        seed(child, start, end);
        if (style === 'grove' && child.children.length) {
          const center = child.children.reduce((sum, n) => ({ x: sum.x + n.x, y: sum.y + n.y }), { x: 0, y: 0 });
          center.x /= child.children.length; center.y /= child.children.length;
          const distance = Math.hypot(center.x - root.x, center.y - root.y) || 1;
          const inset = Math.min(distance * .36, 22 + Math.sqrt(weights.get(child)) * 7);
          child.x = mix(center.x, root.x, inset / distance);
          child.y = mix(center.y, root.y, inset / distance);
        } else {
          const localProgress = style === 'grove' ? .31 + noise(parent.index) * .66 + (jitter - .5) * .14 : progress;
          child.x = mix(root.x, tipX, localProgress);
          child.y = mix(root.y, tipY, localProgress) + (staggerLeaves ? 0 : (jitter - .5) * 32);
          if (staggerLeaves && !child.children.length) {
            // Normal stagger: offset perpendicular to the crown tangent (not
            // radial, which cancels angular separation on an elongated ellipse).
            // Alternating leaves form two rows, so pointed badges can interleave.
            let tx = crown.rx * Math.cos(angle), ty = crown.ry * Math.sin(angle);
            const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const stag = (child.index % 2 === 0 ? 7 : -7);
            child.x += -ty * stag; child.y += tx * stag;
          }
        }
        contain(child);
        start = end;
      }
    }
    const arc = Math.PI * (arcFactor ?? (style === 'fan' ? .51 : style === 'organic' ? .65 : style === 'grove' ? .72 : .79));
    if (['packed','corridors','clear-branches','refined','distributed'].includes(style)) packCrown(root, weights, style === 'corridors',style === 'distributed');
    else seed(root, -arc, arc);
    spread(nodes);
    repairPlacement(nodes);
    let collisions = 0;
    for (const [i, a] of nodes.entries()) for (const b of nodes.slice(i + 1)) {
      if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) collisions++;
    }
    // A denser tree can trade some display size for separation, within the
    // physical print floor. The names themselves always remain complete.
    if (collisions && targetPt > 9.25) return layout(doc, paper, measure, improved ? 'organic-improved' : style, Math.max(9.25, targetPt * .9),arcFactor,stagger);
    const links = [], grid = branchGrid(nodes), branches = branchIndex();
    let preciseGrid;
    const fineGrid = () => preciseGrid ??= branchGrid(nodes, 3);
    for (const parent of nodes) for (const child of parent.children) {
      const link = { parent, child, ...route(parent, child, nodes, grid, fineGrid, branches, style === 'clear-branches') };
      branches.add(link);
      if (style === 'clear-branches') markBranch(grid, link);
      links.push(link);
    }
    if (style === 'refined' || style === 'distributed') refineBranches(links,nodes,grid,fineGrid,branches);
    if (style === 'organic') refineBranches(links,nodes,grid,fineGrid,branches,true);
    if (improved && nodes.length <= 80) {
      for(let pass=0;pass<3;pass++) refineBranches(links,nodes,grid,fineGrid,branches,true,true);
    }
    const branchCrossings = links.reduce((sum,link) => sum + branches.intersections(link.samples,link.parent,link.child).size,0) / 2;
    let contacts;
    if(improved && nodes.length<=80){
      contacts=ribbonContacts(links);
      if(!branchCrossings && contacts){
        for(const reduction of [.85,.70]){
          for(const link of links) link.width=branchWidth(link.child)*reduction;
          contacts=ribbonContacts(links);
          if(!contacts) break;
        }
      }
    }
    return { root, nodes, links, font, minimumPt: font * scale * 72 / 25.4, collisions, maxDepth, branchCrossings,
      ...(contacts===undefined ? {} : { ribbonContacts:contacts }),
      style: improved ? 'organic-improved' : style,
      obstructedBranches: links.filter(link => link.hits).length };
  }

  function branchWidth(child) {
    return Math.min(child.region ? 140 : 42, 2.5 + Math.sqrt(child.descendantCount + 1) * (child.region ? 5 : 2.45));
  }

  const rootFlareReach = .62;

  function ribbonOutline(link) {
    const { samples, child } = link;
    const start = link.width ?? branchWidth(child);
    const end = Math.max(1.7, start * .48);
    const left = [], right = [];
    for (const [i, point] of samples.entries()) {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const progress = i / (samples.length - 1);
      const flare = (link.flare || 0) * Math.max(0, 1-progress/rootFlareReach)**1.55;
      const radius = (mix(start,end,progress)+start*flare) / (Math.hypot(dx,dy)||1) / 2;
      left.push({ x: point.x - dy * radius, y: point.y + dx * radius });
      right.push({ x: point.x + dy * radius, y: point.y - dx * radius });
    }
    return { outline: [...left,...right.reverse()], left, start };
  }

  function rootFlares(links, root, nodes) {
    const primaries = links.filter(link => link.parent === root);
    if (ribbonContacts(links)) return links;
    for (const flare of [1.8, 1.1, .55]) {
      const thickened = primaries.map(link => ({...link,flare}));
      const clear = thickened.every(link => ribbonOutline(link).outline.every((point,i,outline) => {
        const progress = Math.min(i,outline.length-1-i)/(link.samples.length-1);
        return progress >= rootFlareReach || !nodes.some(node => node !== root && node !== link.child &&
          Math.abs(point.x-node.x) <= node.w/2+4 && Math.abs(point.y-node.y) <= node.h/2+4);
      }));
      if (!clear) continue;
      const rendered = links.map(link => thickened.find(candidate=>candidate.child===link.child) || link);
      if (!ribbonContacts(rendered)) return rendered;
    }
    return links;
  }

  function ribbon(link, botanical) {
    const { samples, child } = link;
    const { outline, left, start } = ribbonOutline(link);
    const silhouette = `M${outline.map(pair).join('L')}Z`;
    const grain = samples.map((point, i) => ({
      x: mix(point.x, left[i].x, .38),
      y: mix(point.y, left[i].y, .38)
    }));
    const wood = botanical ? 'url(#hp-branch-wood)' : '#513221';
    const grainColor = botanical ? '#c6945d' : '#bb8959';
    const grainOpacity = botanical ? '.61' : '.64';
    const flare = link.flare ? ` data-root-flare="${link.flare}"` : '';
    return `<g data-parent-id="${escape(link.parent.personId)}" data-child-id="${escape(child.personId)}"${flare}><path d="${silhouette}" fill="${wood}"/><path d="M${grain.map(pair).join('L')}" stroke="${grainColor}" opacity="${grainOpacity}" stroke-width="${round(Math.max(.42, start * .18))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }

  function artwork(improved, engraved) {
    const corner = '<path d="M0 44V0H44M5 32V5H32M10 24Q21 25 25 10M10 24Q5 12 25 10" fill="none" stroke="#9d743c" stroke-width="1.5"/><path d="M10 10l5 2-3 4z" fill="#51766a"/>';
    // Diamond medallion like the reference poster: rotated square, inner diamond, star dot.
    const medallion = (cx, cy, s) => `<g transform="translate(${cx} ${cy})"><path d="M0 ${-s}L${s} 0L0 ${s}L${-s} 0Z" fill="url(#hp-gold)" stroke="#8a6d2f" stroke-width="2.2"/><path d="M0 ${-s*.62}L${s*.62} 0L0 ${s*.62}L${-s*.62} 0Z" fill="none" stroke="#8a6d2f" stroke-width="1.1"/><path d="M0 ${-s*.28}L${s*.28} 0L0 ${s*.28}L${-s*.28} 0Z" fill="#fff8e8" stroke="#8a6d2f" stroke-width=".8"/><circle r="${Math.max(2, s*.09)}" fill="#8a6d2f"/></g>`;
    if (improved) {
      const definitions = `<defs>
      <radialGradient id="hp-sky" cx=".5" cy=".36" r=".74"><stop stop-color="#fffdf5"/><stop offset=".68" stop-color="#f9f2df"/><stop offset="1" stop-color="#efe3c8"/></radialGradient>
      ${engraved?'<pattern id="hp-paper" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M0 0L16 16L32 6L48 16L64 0M0 64L16 48L32 58L48 48L64 64M0 32L16 16L26 32L16 48Z M64 32L48 16L38 32L48 48Z M26 32L32 26L38 32L32 38Z" fill="none" stroke="#ae8f60" stroke-width=".7" opacity=".23"/></pattern>':'<pattern id="hp-paper" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M17 2L32 17L17 32L2 17Z" fill="none" stroke="#c9b98a" stroke-width=".55" opacity=".28"/><circle cx="17" cy="17" r="1.1" fill="#c9b98a" opacity=".3"/></pattern>'}
      <linearGradient id="hp-field" x2="0" y2="1"><stop stop-color="#9aaa54"/><stop offset="1" stop-color="#344a2d"/></linearGradient>
      <linearGradient id="hp-meadow" x2="0" y2="1"><stop stop-color="#dce5ba" stop-opacity=".46"/><stop offset="1" stop-color="#829650" stop-opacity=".8"/></linearGradient>
      <linearGradient id="hp-bark"><stop stop-color="#4a2c17"/><stop offset=".42" stop-color="#8a5a33"/><stop offset=".65" stop-color="#6b4226"/><stop offset="1" stop-color="#3d2215"/></linearGradient>
      <linearGradient id="hp-branch-wood" gradientUnits="userSpaceOnUse" x1="0" x2="1200" y1="0" y2="0"><stop stop-color="#573923"/><stop offset=".35" stop-color="#6d472c"/><stop offset=".53" stop-color="#4d2d1c"/><stop offset=".76" stop-color="#6e492e"/><stop offset="1" stop-color="#50311f"/></linearGradient>
      <linearGradient id="hp-leaf" x2="0" y2="1"><stop stop-color="#f1edaf"/><stop offset=".48" stop-color="#d7e4a2"/><stop offset="1" stop-color="#99b679"/></linearGradient>
      <linearGradient id="hp-leaf-dark" x2="0" y2="1"><stop stop-color="#3f8a4a"/><stop offset="1" stop-color="#1e5c2e"/></linearGradient>
      <linearGradient id="hp-leaf-green" x2="0" y2="1"><stop stop-color="${engraved?'#517f48':'#79994c'}"/><stop offset=".48" stop-color="${engraved?'#276047':'#476c39'}"/><stop offset="1" stop-color="${engraved?'#194637':'#294d2c'}"/></linearGradient>
      <linearGradient id="hp-leaf-light" x2="0" y2="1"><stop stop-color="#acb965"/><stop offset=".48" stop-color="#789448"/><stop offset="1" stop-color="#456330"/></linearGradient>
      <linearGradient id="hp-leaf-deep" x2="0" y2="1"><stop stop-color="#66804a"/><stop offset=".52" stop-color="#3d6337"/><stop offset="1" stop-color="#213d28"/></linearGradient>
      <linearGradient id="hp-gold" x2="0" y2="1"><stop stop-color="#fff5d9"/><stop offset=".6" stop-color="#f4dc9e"/><stop offset="1" stop-color="#c3974c"/></linearGradient>
      <linearGradient id="hp-badge" x2="0" y2="1"><stop stop-color="#fffdf5"/><stop offset=".55" stop-color="#f7e8c3"/><stop offset="1" stop-color="#e8d5a8"/></linearGradient>
      <radialGradient id="hp-medallion" cx=".5" cy=".42" r=".65"><stop stop-color="#fff8e0"/><stop offset=".7" stop-color="#f4dc9e"/><stop offset="1" stop-color="#b8892b"/></radialGradient>
      <pattern id="hp-border" width="29" height="29" patternUnits="userSpaceOnUse"><rect width="29" height="29" fill="#263e35"/><path d="M14.5 2L18 11L27 14.5L18 18L14.5 27L11 18L2 14.5L11 11Z" fill="none" stroke="#e0bb70" stroke-width=".85"/><path d="M14.5 7L22 14.5L14.5 22L7 14.5Z" fill="#9b7843" stroke="#f2d59d" stroke-width=".55"/><circle cx="14.5" cy="14.5" r="1.8" fill="#f7e6b6"/></pattern>
    </defs>`;
      const background = `
    <rect x="28" y="28" width="1144" height="1641" rx="3" fill="url(#hp-sky)" stroke="#b8892b" stroke-width="2.5"/>
    <rect x="30" y="30" width="1140" height="1637" fill="url(#hp-paper)"/>
    ${engraved?'':`<path d="M30 1586C254 1533 394 1564 575 1598C756 1548 949 1533 1170 1573V1667H30Z" fill="#c4cc9a" opacity=".36"/>
    <path d="M30 1623C255 1571 431 1611 597 1621C776 1584 982 1575 1170 1608V1667H30Z" fill="url(#hp-meadow)"/>`}
    `;
      const frame = `
    <path d="M0 0H1200V1697H0Z M28 28H1172V1669H28Z" fill="url(#hp-border)" fill-rule="evenodd"/>
    <rect x="40" y="40" width="1120" height="1617" rx="2" fill="none" stroke="#8a6d2f" stroke-width="2"/>
    <rect x="47" y="47" width="1106" height="1603" rx="2" fill="none" stroke="#c9a95f" stroke-width="1"/>
    <rect x="54" y="54" width="1092" height="1589" rx="2" fill="none" stroke="#8a6d2f" stroke-width=".7"/>
    ${medallion(54,54,26)}${medallion(1146,54,26)}${medallion(54,1643,26)}${medallion(1146,1643,26)}
    ${engraved?[[60,60,1,1],[1140,60,-1,1],[60,1638,1,-1],[1140,1638,-1,-1]].map(([x,y,sx,sy])=>`
      <g transform="translate(${x} ${y}) scale(${sx} ${sy})" aria-hidden="true">
       <path d="M0 102V0H102M7 78C8 36 30 15 81 7M8 58C18 27 43 5 68 8M7 36C9 14 14 7 36 7M17 28C13 9 42 14 34 28C30 37 22 35 19 29" fill="none" stroke="#805321" stroke-width="2.2"/>
       <path d="M16 57Q30 42 49 37Q40 53 16 57ZM36 16Q52 20 70 11Q57 25 36 16Z" fill="#526c45" stroke="#967449" stroke-width=".9"/>
      </g>`).join(''):`${medallion(165,150,42)}${medallion(1035,150,42)}`}
    `;
      const trunk = `
    <ellipse cx="600" cy="1587" rx="162" ry="20" fill="#435135" opacity=".18"/>
    <path d="M553 1208C561 1289 549 1361 543 1420C536 1497 522 1545 498 1567Q478 1584 451 1594Q489 1597 530 1582Q553 1573 568 1581Q600 1600 632 1578Q647 1572 674 1584Q712 1596 749 1590C710 1575 691 1558 676 1533C656 1480 648 1412 651 1368C654 1304 641 1261 650 1208Q600 1191 553 1208Z" fill="url(#hp-bark)" stroke="#4d2b16" stroke-width="3"/>
    <path d="M578 1236C590 1360 566 1500 548 1580M600 1240C612 1350 588 1490 598 1600M622 1241C608 1366 626 1490 644 1580M574 1280C570 1350 564 1430 560 1500M628 1330C618 1400 634 1490 654 1550" fill="none" stroke="#d29c5f" stroke-width="3" opacity=".4"/>
    <path d="M602 1256C624 1300 580 1335 610 1400C628 1440 594 1500 614 1550M560 1410Q562 1510 512 1560M632 1460Q650 1540 684 1560" fill="none" stroke="#2c180e" stroke-width="4" opacity=".6"/>
    <path d="M535 1509Q515 1559 475 1587M563 1512Q548 1556 523 1576M645 1500Q669 1561 719 1585M622 1520Q636 1558 652 1570" fill="none" stroke="#d4a06a" stroke-width="2.4" opacity=".5"/>
    <g fill="none" stroke="#c58a52" opacity=".3" stroke-width="1.15">${Array.from({length:24},(_,i)=>{const x=560+noise(i+510)*80,y=1280+noise(i+640)*264;return `<path d="M${round(x)} ${round(y)}q${round((noise(i)-.5)*11)} 15 ${round((noise(i+16)-.5)*8)} ${round(17+noise(i+26)*28)}"/>`;}).join('')}</g>
    <g fill="none" stroke="#627b41" stroke-linecap="round" opacity=".7">${Array.from({length:27},(_,i)=>{const x=467+i*10,y=1598+noise(i+443)*15,h=5+noise(i+410)*15;return `<path d="M${round(x)} ${round(y)}q2 -7 -5 ${round(-h)}m5 ${round(h)}q3 -6 8 ${round(-h*.85)}"/>`;}).join('')}</g>`;
      return { definitions, background, frame, trunk };
    }
    const definitions = `<defs>
      <radialGradient id="hp-sky" cx=".5" cy=".36" r=".74"><stop stop-color="#fffbed"/><stop offset=".68" stop-color="#f4e8cc"/><stop offset="1" stop-color="#dfcba6"/></radialGradient>
      <pattern id="hp-paper" width="17" height="19" patternUnits="userSpaceOnUse"><path d="M2 4h1m8 7h1m-6 5h1" stroke="#8f6942" stroke-width=".55" opacity=".24"/></pattern>
      <linearGradient id="hp-field" x2="0" y2="1"><stop stop-color="#9aaa54"/><stop offset="1" stop-color="#344a2d"/></linearGradient>
      <linearGradient id="hp-bark"><stop stop-color="#3d2215"/><stop offset=".42" stop-color="#875630"/><stop offset=".65" stop-color="#603719"/><stop offset="1" stop-color="#351f13"/></linearGradient>
      <linearGradient id="hp-leaf" x2="0" y2="1"><stop stop-color="#f1edaf"/><stop offset=".48" stop-color="#d7e4a2"/><stop offset="1" stop-color="#99b679"/></linearGradient>
      ${improved?'<linearGradient id="hp-leaf-dark" x2="0" y2="1"><stop stop-color="#315b36"/><stop offset="1" stop-color="#183a24"/></linearGradient>\n      ':''}<linearGradient id="hp-gold" x2="0" y2="1"><stop stop-color="#fff5d9"/><stop offset=".6" stop-color="#f4dc9e"/><stop offset="1" stop-color="#c3974c"/></linearGradient>
      <pattern id="hp-border" width="29" height="29" patternUnits="userSpaceOnUse"><rect width="29" height="29" fill="#183b3c"/><path d="M14.5 2L18 11L27 14.5L18 18L14.5 27L11 18L2 14.5L11 11Z" fill="none" stroke="#c9a95f" stroke-width=".85"/><path d="M14.5 7L22 14.5L14.5 22L7 14.5Z" fill="#936741" stroke="#e4c67d" stroke-width=".55"/><circle cx="14.5" cy="14.5" r="2.2" fill="#f7d99a"/></pattern>
    </defs>`;
    const background = `
    <rect x="28" y="28" width="1144" height="1641" rx="3" fill="url(#hp-sky)" stroke="#e5c17b" stroke-width="4"/>
    <rect x="30" y="30" width="1140" height="1637" fill="url(#hp-paper)"/>
    <path d="M30 1452L120 1409L184 1417L267 1368L340 1396L433 1385L544 1448L631 1426L722 1395L795 1405L884 1367L983 1388L1045 1372L1170 1427V1667H30Z" fill="#c7ac82" opacity=".73"/>
    <path d="M30 1452Q298 1390 560 1480Q889 1406 1170 1430V1667H30Z" fill="#a6ae78"/>
    <path d="M30 1528Q251 1413 543 1529Q870 1411 1170 1495V1667H30Z" fill="url(#hp-field)"/>
    <path d="M30 1613Q322 1513 575 1604Q859 1505 1170 1567V1667H30Z" fill="#5b723b" opacity=".66"/>
    <path d="M33 1608Q308 1533 556 1608M651 1591Q917 1515 1167 1573M34 1632Q254 1567 431 1619M769 1616Q963 1568 1167 1602" fill="none" stroke="#b8c379" stroke-width="3" opacity=".35"/>
    <g stroke="#c4cb83" stroke-width="1.3" fill="none" opacity=".33">${Array.from({length:94},(_,i)=>{const x=58+noise(i+370)*1080,y=1480+noise(i+220)*150;return `<path d="M${round(x)} ${round(y)}q-2-6-7-10m7 10q2-9 6-13"/>`;}).join('')}</g>
    `;
    const frame = `
    <path d="M0 0H1200V1697H0Z M28 28H1172V1669H28Z" fill="url(#hp-border)" fill-rule="evenodd"/>
    <rect x="40" y="40" width="1120" height="1617" rx="2" fill="none" stroke="#8e7045" stroke-width="1.5"/>
    <rect x="47" y="47" width="1106" height="1603" rx="2" fill="none" stroke="#c6a45d" stroke-width="1"/>
    <g transform="translate(59 59)">${corner}</g><g transform="translate(1141 59) scale(-1 1)">${corner}</g>
    <g transform="translate(59 1638) scale(1 -1)">${corner}</g><g transform="translate(1141 1638) scale(-1 -1)">${corner}</g>
    `;
    const trunk = `
    <path d="M562 1208C568 1295 557 1411 547 1478C537 1515 516 1537 483 1557Q539 1552 567 1544Q590 1572 619 1551Q665 1567 711 1560C679 1543 654 1515 645 1477C628 1401 632 1301 642 1208Q603 1190 562 1208Z" fill="url(#hp-bark)" stroke="#4d2b16" stroke-width="3"/>
    <path d="M581 1236C593 1350 566 1485 547 1538M595 1240C607 1340 578 1460 588 1544M620 1241C605 1356 623 1471 642 1538M576 1277C573 1341 567 1408 564 1459M627 1327C616 1387 633 1466 653 1517" fill="none" stroke="#d29c5f" stroke-width="3" opacity=".37"/>
    <path d="M602 1256C623 1299 579 1331 608 1394C626 1432 591 1490 611 1537M563 1405Q565 1497 515 1544M629 1458Q647 1530 681 1548" fill="none" stroke="#2c180e" stroke-width="4" opacity=".63"/>
    <g fill="none" stroke="#c58a52" opacity=".28" stroke-width="1.15">${Array.from({length:27},(_,i)=>{const x=569+noise(i+510)*60,y=1238+noise(i+640)*253;return `<path d="M${round(x)} ${round(y)}q${round((noise(i)-.5)*11)} 15 ${round((noise(i+16)-.5)*8)} ${round(17+noise(i+26)*28)}"/>`;}).join('')}</g>`;
    return { definitions, background, frame, trunk };
  }

  function label(node, font, presentation, sector, dark, generationOffset = 0, engraved = false) {
    font=node.font||font;
    const x = node.shapeWidth / 2, y = node.shapeHeight / 2;
    const generation = core.color(presentation, node.generation + generationOffset);
    const leaf = node.children.length === 0 && node.generation !== 0;
    // Ornate (improved): beige name badge like the reference poster, with a
    // decorative green leaf behind it. Text stays dark-on-light for legibility.
    const badge = `<ellipse rx="${x}" ry="${y}" fill="url(#hp-${dark?'badge':'gold'})" stroke="${generation}" stroke-width="2"/><ellipse rx="${round(x-2.5)}" ry="${round(y-2.5)}" fill="none" stroke="#8b6031" stroke-width=".65"/>`;
    const leafFill = noise(node.index + 11) > .66 ? 'url(#hp-leaf-light)' : noise(node.index + 11) > .33 ? 'url(#hp-leaf-green)' : 'url(#hp-leaf-deep)';
    const decoLeaf = (lx, ly, dx, dy, rot) => `<g transform="translate(${round(dx)} ${round(dy)}) rotate(${round(rot)})"><path d="M${round(-lx*1.15)} ${round(ly*.55)}Q${round(-lx*.4)} ${round(ly*.3)} ${round(-lx*.85)} 0" stroke="#2e5d3a" stroke-width="1.1" fill="none"/><path d="M${-lx} 0C${-lx} ${-ly} ${round(lx*.25)} ${round(-ly*1.3)} ${lx} 0C${round(lx*.25)} ${round(ly*1.3)} ${-lx} ${ly} ${-lx} 0Z" fill="${leafFill}" stroke="#2e5d3a" stroke-width="1"/><path d="M${round(-lx*.82)} 0Q0 ${round(-ly*.22)} ${round(lx*.82)} 0" stroke="#c8e6c9" opacity=".65" fill="none" stroke-width=".9"/><path d="M${round(-lx*.3)} ${round(-ly*.28)}Q${round(-lx*.05)} ${round(-ly*.05)} ${round(lx*.3)} ${round(-ly*.28)}M${round(-lx*.3)} ${round(ly*.28)}Q${round(-lx*.05)} ${round(ly*.05)} ${round(lx*.3)} ${round(ly*.28)}" stroke="#a8d5a2" opacity=".4" fill="none" stroke-width=".6"/></g>`;
    let shape, textFill = ink;
    if (engraved) {
      shape=leaf?badge:`<path d="M0 -1C.21 -.87 .41 -1 .58 -.79C.74 -.65 .9 -.74 .92 -.43C1 -.28 1 .28 .92 .43C.9 .74 .74 .65 .58 .79C.41 1 .21 .87 0 1C-.21 .87 -.41 1 -.58 .79C-.74 .65 -.9 .74 -.92 .43C-1 .28 -1 -.28 -.92 -.43C-.9 -.74 -.74 -.65 -.58 -.79C-.41 -1 -.21 -.87 0 -1Z" transform="scale(${x} ${y})" vector-effect="non-scaling-stroke" fill="url(#hp-gold)" stroke="${generation}" stroke-width="1"/>`;
    } else if (dark && leaf) {
      // Green leaf peeking above/behind the badge, badge on top (reference style).
      shape = decoLeaf(x*.92, y*1.15, -x*.12, -y*1.05, (node.leafFacing||1)*-18) + badge;
      textFill = ink;
    } else if (leaf && (sector || dark)) {
      shape = `<path d="M${-x} 0C${-x} ${-y} ${round(x*.3)} ${round(-y*1.2)} ${x} 0C${round(x*.3)} ${round(y*1.2)} ${-x} ${y} ${-x} 0Z" fill="url(#hp-leaf${dark?'-dark':''})" stroke="${generation}" stroke-width="${sector?.28:1.4}"/>`;
      textFill = dark ? '#fffdf3' : '#243618';
    } else if (leaf) {
      shape = `<path d="M${-x} ${round(y*.34)}C${round(-x*.74)} ${round(-y*1.24)} ${round(x*.25)} ${round(-y*.78)} ${x} ${round(-y*.43)}C${round(x*.62)} ${round(y*1.15)} ${round(-x*.4)} ${round(y*1.1)} ${-x} ${round(y*.34)}Z" fill="url(#hp-leaf)" stroke="${generation}" stroke-width="1.4"/><path d="M${round(-x*.88)} ${round(y*.26)}Q0 ${round(-y*.04)} ${round(x*.86)} ${round(-y*.36)}" stroke="#a6c478" opacity=".28" fill="none"/>`;
      textFill = '#243618';
    } else {
      shape = badge;
      textFill = ink;
    }
    const lines = node.lines.map((line, i) => `<tspan x="0" y="${round((i-(node.lines.length-1)/2)*font*1.14+font*.32)}">${escape(line)}${i+1<node.lines.length?' ':''}</tspan>`).join('');
    return `<g transform="translate(${pair(node)}) rotate(${round(node.tilt)})" data-person-id="${escape(node.personId)}" data-generation="${node.generation+generationOffset}"><g transform="scale(${node.leafFacing||1} 1)">${shape}</g><text data-poster-name="true" text-anchor="middle" direction="rtl" style="unicode-bidi:plaintext" font-size="${font}" fill="${textFill}">${lines}</text></g>`;
  }

  // Decorative green leaves along branches (ornament only, never persons).
  function decorativeLeaves(links, nodes, engraved) {
    const out = [];
    const placements = [];
    const cell=48,buckets=new Map();
    for(const link of links) for(const point of link.samples||[]){
      const key=`${Math.floor(point.x/cell)}:${Math.floor(point.y/cell)}`;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push({link,point});
    }
    function nearAnotherBranch(link,x,y,distance){
      for(let col=Math.floor((x-distance)/cell);col<=Math.floor((x+distance)/cell);col++){
        for(let row=Math.floor((y-distance)/cell);row<=Math.floor((y+distance)/cell);row++){
          if((buckets.get(`${col}:${row}`)||[]).some(item=>item.link!==link&&Math.hypot(item.point.x-x,item.point.y-y)<distance))return true;
        }
      }
      return false;
    }
    links.forEach((link, idx) => {
      const s = link.samples;
      if (!s || s.length < 10) return;
      const bw = link.width ?? branchWidth(link.child);
      const distances = [0];
      for (let i = 1; i < s.length; i++) {
        distances.push(distances[i-1] + Math.hypot(s[i].x-s[i-1].x,s[i].y-s[i-1].y));
      }
      const length = distances.at(-1);
      if (length < (engraved?58:76)) return;
      const spots = length > 350 ? [.22,.39,.58,.76] :
        length > 240 ? [.26,.5,.74] : length > 140 ? [.36,.64] : [.5];
      for (const [slot, frac] of spots.entries()) {
        const i = distances.findIndex(distance => distance >= length * frac);
        const pt = s[i], a = s[Math.max(0, i - 2)], b = s[Math.min(s.length - 1, i + 2)];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const tx = dx/len, ty = dy/len;
        const nx = -dy / len, ny = dx / len;
        const firstSide = (idx + slot) % 2 ? 1 : -1;
        const lx = 12 + Math.min(11, bw * .32) + noise(idx + slot * 127 + 3) * 4, ly = lx * .41;
        const tone = noise(idx + slot * 127 + 11);
        const fill = tone > .66 ? 'url(#hp-leaf-light)' : tone > .33 ? 'url(#hp-leaf-green)' : 'url(#hp-leaf-deep)';
        for (const side of [firstSide, -firstSide]) {
          const angle = (45+noise(idx + slot * 127 + 23)*24)*Math.PI/180;
          const ux = tx*Math.cos(angle) + side*nx*Math.sin(angle);
          const uy = ty*Math.cos(angle) + side*ny*Math.sin(angle);
          const reach = lx + Math.min(13, bw*.24) + 4;
          const x = pt.x + ux * reach, y = pt.y + uy * reach;
          if (nodes.some(node => Math.abs(x-node.x) < node.w/2+lx+9 &&
              Math.abs(y-node.y) < node.h/2+lx+9)) continue;
          if (placements.some(leaf => Math.hypot(leaf.x-x,leaf.y-y) < leaf.radius+lx)) continue;
          if (nearAnotherBranch(link,x,y,lx+1)) continue;
          placements.push({x,y,radius:lx});
          const rot = Math.atan2(uy,ux)*180/Math.PI;
          out.push(`<g data-poster-ornament="leaf" transform="translate(${round(x)} ${round(y)}) rotate(${round(rot)})" pointer-events="none" aria-hidden="true"><path d="M${round(-reach)} 0H${round(-lx)}" stroke="#607745" stroke-width="1.6"/><path d="M${-lx} 0C${round(-lx*.64)} ${round(-ly*1.45)} ${round(lx*.31)} ${round(-ly*.93)} ${lx} ${round(-ly*.26)}C${round(lx*.60)} ${round(ly*1.42)} ${round(-lx*.47)} ${round(ly*.99)} ${-lx} 0Z" fill="${fill}" stroke="#355a38" stroke-width=".9"/><path d="M${round(-lx*.82)} 0Q0 ${round(ly*.22)} ${round(lx*.79)} ${round(-ly*.16)}m${round(-lx*.69)} ${round(ly*.16)}l${round(-lx*.30)} ${round(-ly*.46)}m${round(lx*.45)} ${round(ly*.44)}l${round(lx*.26)} ${round(ly*.28)}" stroke="#d8e7ac" opacity=".68" fill="none" stroke-width=".75"/></g>`);
          if(!engraved||length<180)break;
        }
      }
    });
    return out.join('');
  }

  function rootMedallion(root) {
    return `<g data-poster-ornament="root" aria-hidden="true" transform="translate(${pair(root)})">
      <g transform="scale(${round(root.shapeWidth/2+17)} ${round(root.shapeHeight/2+13)})" stroke="#8a6d2f" stroke-width="1.6">
        <path d="M0 -1.12C.29 -.92 .74 -.96 .88 -.57L1.08 0 .88 .57C.74 .96 .29 .92 0 1.12C-.29 .92 -.74 .96 -.88 .57L-1.08 0 -.88 -.57C-.74 -.96 -.29 -.92 0 -1.12Z" vector-effect="non-scaling-stroke" fill="url(#hp-medallion)"/>
        <ellipse rx=".96" ry=".91" fill="none" stroke="#fff5ce" vector-effect="non-scaling-stroke"/>
      </g>
    </g>`;
  }

  function editorialPanel(notes, count, generations, measure) {
    const footerLines = [notes?.summary, notes?.source, notes?.credit]
      .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim());
    const text = footerLines.map((line,index) => {
      const size = Math.min(15, Math.floor(234 * 15 / Math.max(1,measure(line,15))));
      if (size < 11) throw new RangeError('النص التعريفي أطول من مساحة بطاقة اللوحة');
      return `<text x="211" y="${1572+index*17}" font-size="${size}" data-poster-editorial-line="">${escape(line)}</text>`;
    }).join('');
    return `<g data-poster-editorial="">
      <rect x="76" y="1520" width="270" height="104" rx="10" fill="#fff8e8" stroke="#b8892b" stroke-width="2.2"/>
      <rect x="82" y="1526" width="258" height="92" rx="6" fill="none" stroke="#c9a95f" stroke-width=".8"/>
      <text x="211" y="${text?'1551':'1561'}" font-size="19" font-weight="700">${count} اسمًا في الشجرة</text>
      ${text || `<text x="211" y="1596" font-size="16">${generations} أجيال</text>`}
    </g>`;
  }

  function centerEngravedBoard(result,w,h){
    const nextWidth=Math.max(result.boardWidth,result.boardHeight*w/h);
    const nextHeight=nextWidth*h/w;
    const dx=(nextWidth-result.boardWidth)/2;
    const dy=(nextHeight-result.boardHeight)/2;
    for(const node of result.nodes){node.x+=dx;node.y+=dy;}
    for(const link of result.links){
      link.samples=link.samples.map(point=>({x:point.x+dx,y:point.y+dy}));
    }
    result.boardWidth=nextWidth;
    result.boardHeight=nextHeight;
  }

  function render(doc, w, h, measure, style, generationOffset = 0, options) {
    const result = layout(doc, { width: w, height: h }, measure, style);
    const { nodes, links, font, root, maxDepth } = result;
    const engraved=result.style==='engraved-crown';
    const engravedAdaptive=engraved&&!!result.boardWidth;
    if(engravedAdaptive&&!options?.sizeFree)centerEngravedBoard(result,w,h);
    const improved = result.style === 'organic-improved' || engraved;
    const renderedLinks = improved && nodes.length<=80 ? rootFlares(links,root,nodes) : links;
    const boardWidth=result.boardWidth||width, boardHeight=result.boardHeight||height;
    const sx=boardWidth/width, sy=boardHeight/height;
    const decoration = artwork(improved,engraved);
    const boardTransform = `scale(${sx} ${sy})`;
    let trunkTransform = boardTransform;
    if(result.style==='growing' || result.style==='sector' || engravedAdaptive) {
      const trunkY=(boardHeight*.92-root.y)/(1560-1225);
      const trunkX=result.style==='sector' ? boardWidth*.10/228 : Math.max(1,root.shapeWidth/(engraved?82:100));
      trunkTransform = `translate(${root.x-600*trunkX} ${root.y-1225*trunkY}) scale(${trunkX} ${trunkY})`;
    }
    const decorScale=Math.min(sx,sy);
    const headerTransform=`translate(${boardWidth/2-600*decorScale} ${128*sy-128*decorScale}) scale(${decorScale})`;
    const title = doc.title || 'شجرة العائلة';
    const titleFont = Math.min(56, 810 * 56 / Math.max(1, measure(title, 56)));
    const generationFont = maxDepth < 14 ? 14 : Math.max(8, 190 / (maxDepth + 1));
    const legend = Array.from({ length: Math.min(maxDepth + 1, 21) }, (_, i) => {
      const x = 895 + (i % 7) * 32, y = 1581 + Math.floor(i / 7) * 18;
      return `<circle cx="${x}" cy="${y}" r="5" fill="${core.color(doc.presentation, i+generationOffset)}"/><text x="${x+8}" y="${y+4}" font-size="${generationFont*.7}" direction="ltr" text-anchor="start">${i+1+generationOffset}</text>`;
    }).join('');
    const fontFamily = options?.nameFont === 'Amiri' ? 'Amiri,Tahoma,Arial,sans-serif' : 'Tahoma,Arial,sans-serif';
    const dimensions=options?.sizeFree?'preserveAspectRatio="xMidYMid meet"':`width="${w}mm" height="${h}mm"`;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" ${dimensions} viewBox="0 0 ${boardWidth} ${boardHeight}" text-rendering="geometricPrecision" font-family="${fontFamily}"><title>${escape(title)}</title>${decoration.definitions}
      <g id="hp-background-layer" inkscape:groupmode="layer" inkscape:label="الخلفية" transform="${boardTransform}">${decoration.background}</g>
      <g id="hp-frame-layer" inkscape:groupmode="layer" inkscape:label="الإطار" transform="${boardTransform}">${decoration.frame}</g>
      <g id="hp-trunk-layer" inkscape:groupmode="layer" inkscape:label="الجذع"${engraved?'':` transform="${trunkTransform}"`}>${engraved?`<g transform="${trunkTransform}">${decoration.trunk}</g>${rootMedallion(root)}`:`${decoration.trunk}${improved?rootMedallion(root):''}`}</g>
      <g transform="${headerTransform}" fill="${ink}" direction="rtl" text-anchor="middle">${improved?`<text x="600" y="118" font-size="${Math.min(64,titleFont+6)}" font-weight="700" font-family="Amiri,Tahoma,serif">${escape(title)}</text><text x="600" y="146" font-size="17" font-family="Amiri,Tahoma,serif" fill="#8a6d2f">شجرة النسب · لوحة تراثية</text><path d="M235 162H482M718 162H965M582 162l18-11 18 11-18 11Z" fill="none" stroke="#a88342" stroke-width="2"/>`:`<path d="M235 157H482M718 157H965M582 157l18-11 18 11-18 11Z" fill="none" stroke="#a88342" stroke-width="2"/><text x="600" y="128" font-size="${titleFont}" font-weight="700">${escape(title)}</text>`}</g>
      <g id="hp-branches-layer" inkscape:groupmode="layer" inkscape:label="أغصان النسب">${renderedLinks.map(link=>ribbon(link,improved)).join('')}${improved?decorativeLeaves(renderedLinks,nodes,engraved):''}</g>
      <g id="hp-names-layer" inkscape:groupmode="layer" inkscape:label="الأوراق والأسماء">${nodes.map(node => label(node,font,doc.presentation,result.style==='sector',improved,generationOffset,engraved)).join('')}</g>
      <g transform="scale(${sx} ${sy})" fill="${ink}" text-anchor="middle" direction="rtl">${improved?`${editorialPanel(options?.notes,nodes.length,maxDepth+1,measure)}<rect x="852" y="1520" width="270" height="104" rx="10" fill="#fff8e8" stroke="#b8892b" stroke-width="2.2"/><rect x="858" y="1526" width="258" height="92" rx="7" fill="none" stroke="#c9a95f" stroke-width=".8"/><text x="987" y="1553" font-size="17" font-weight="700" font-family="Amiri,Tahoma,serif">ألوان الأجيال</text>${legend}`:`<rect x="76" y="1520" width="270" height="104" rx="12" fill="url(#hp-gold)" stroke="#865c31" stroke-width="2"/><text x="211" y="1561" font-size="19" font-weight="700">${nodes.length} اسمًا في الشجرة</text><text x="211" y="1596" font-size="16">${maxDepth+1} أجيال</text><rect x="852" y="1520" width="270" height="104" rx="12" fill="url(#hp-gold)" stroke="#865c31" stroke-width="2"/><text x="987" y="1553" font-size="17" font-weight="700">ألوان الأجيال</text>${legend}`}</g></svg>`;
    return { ...result, svg: markup, w, h, pt: result.minimumPt, count: nodes.length, rootName: root.fullName };
  }
  function splitPages(doc, limit = 51) {
    if (!Number.isInteger(limit) || limit < 2 || limit > 60) throw Error('حد الصفحة يجب أن يكون من 2 إلى 60 شخصًا.');
    const {root} = core.visible(doc);
    if (!root) throw Error('لا يوجد أصل ظاهر للوحة.');
    const people = new Map(doc.persons.map(person => [person.personId,person]));
    const edges = new Map(doc.relationships.filter(rel=>rel.type==='father').map(rel=>[rel.childId,rel]));
    const pages = [];
    const queue = [{anchor:root, children:root.children, from:null}];
    for (const {anchor,children,from} of queue) {
      const number = pages.length + 1;
      const persons = [people.get(anchor.personId)], relationships = [];
      function include(parent, children) {
        for (let i=0;i<children.length;i++) {
          const child = children[i];
          const subtreeSize = child.descendantCount + 1;
          if (persons.length === limit ||
              (subtreeSize < limit && persons.length + subtreeSize > limit)) {
            queue.push({anchor:parent,children:children.slice(i),from:number});
            return;
          }
          persons.push(people.get(child.personId));
          relationships.push(edges.get(child.personId));
          if (subtreeSize >= limit && children.length > 1) {
            queue.push({anchor:child,children:child.children,from:number});
          } else include(child, child.children);
        }
      }
      include(anchor, children);
      pages.push({number,from,anchor:anchor.fullName,generation:anchor.generation,document:{
        ...doc, rootPersonId:anchor.personId, persons, relationships
      }});
    }
    return pages;
  }

  function renderPaged(doc, w, h, measure, limit) {
    return splitPages(doc, limit).map(page => {
      const options = [render(page.document,w,h,measure,'organic-improved',page.generation)];
      const first = options[0];
      if(first.collisions || first.branchCrossings || first.obstructedBranches || first.ribbonContacts) {
        options.push(render(page.document,w,h,measure,'growing',page.generation));
      }
      options.sort((a,b)=>{
        const issues = r => r.collisions*1e6 + r.obstructedBranches*1e4 + r.branchCrossings*100 + (r.ribbonContacts||0);
        return issues(a)-issues(b) || b.pt-a.pt;
      });
      return {...page,art:options[0]};
    });
  }
  return { layout, render, splitPages, renderPaged };
});
