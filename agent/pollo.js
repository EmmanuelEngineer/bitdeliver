class Noded {
    constructor(x, y, cost, heuristic) {
      this.x = x;
      this.y = y;
      this.cost = cost;
      this.heuristic = heuristic;
      this.parent = null;
    }
    get totalCost() {
      return this.cost + this.heuristic;
    }
  }
  function aStar(grid, start, end) {
    const openSet = [start];
    const closedSet = new Set();
    while (openSet.length > 0) {
      openSet.sort((a, b) => a.totalCost - b.totalCost);
      const currentNode = openSet.shift();
      if (currentNode.x === end.x && currentNode.y === end.y) {
        return reconstructPath(currentNode);
      }
      closedSet.add(currentNode);
      const neighbors = getNeighbors(grid, currentNode);
      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor)) continue;
        const tentativeCost = currentNode.cost + 1;
        if (!openSet.includes(neighbor) || tentativeCost < neighbor.cost) {
          neighbor.cost = tentativeCost;
          neighbor.heuristic = heuristic(neighbor, end);
          neighbor.parent = currentNode;
          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }
    return null; // No path found
  }
  function heuristic(node, goal) {
    // Euclidean distance heuristic
    return Math.sqrt((node.x - goal.x) ** 2 + (node.y - goal.y) ** 2);
  }
  function getNeighbors(grid, node) {
    const neighbors = [];
    const dx = [-1, 1, 0, 0];
    const dy = [0, 0, -1, 1];
    for (let i = 0; i < 4; i++) {
      const x = node.x + dx[i];
      const y = node.y + dy[i];
      if (x >= 0 && x < grid.length && y >= 0 && y < grid[0].length && grid[x][y] === 0) {
        neighbors.push(new Node(x, y, 0, 0));
      }
    }
    return neighbors;
  }
  function reconstructPath(node) {
    const path = [];
    while (node !== null) {
      path.unshift([node.x, node.y]);
      node = node.parent;
    }
    return path;
  }
  import { Pathfinder,Node } from './Pathfinder.mjs';
  let pathfinder = new Pathfinder(10,10)
  const grid =  [
  [1,1,0,1,0,1,0,1,1,1],
  [0,0,0,0,0,0,0,0,0,0],
  [1,1,0,1,0,1,0,1,0,1],
  [1,1,0,1,0,1,0,1,0,0],
  [1,1,0,1,0,1,0,1,1,0],
  [0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0],
  [1,1,0,1,1,1,0,1,1,0],
  [1,1,0,1,0,0,0,1,1,0],
  [1,1,0,0,0,1,0,1,1,0]
  ]
  console.log(grid);
  const start = new Node(1, 1, 0, 0);
  const end = new Node(8, 4, 0, 0);
  const path = pathfinder.aStar(grid, start, end);
  console.log("Shortest Path:", path);