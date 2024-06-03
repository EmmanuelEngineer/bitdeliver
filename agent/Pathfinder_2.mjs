import { Utilities as ut } from "./Utilities.js";

export class Pathfinder {
  static aStar(grid, start, end) {
    const openSet = new Map();
    const closedSet = new Set();
    openSet.set(`${start.x},${start.y}`, start);

    if (grid[end.x][end.y] == 1) {
      //console.log("Già occupato", ut.printGridSE(grid, start, end));
      return null;
    }

    while (openSet.size > 0) {
      const currentNode = this.getLowestCostNode(openSet);
      if (currentNode.x === end.x && currentNode.y === end.y) {
        return this.reconstructPath(currentNode);
      }

      openSet.delete(`${currentNode.x},${currentNode.y}`);
      closedSet.add(`${currentNode.x},${currentNode.y}`);

      const neighbors = this.getNeighbors(grid, currentNode);
      for (const neighbor of neighbors) {
        if (closedSet.has(`${neighbor.x},${neighbor.y}`)) continue;

        const tentativeCost = currentNode.cost + 1;
        const neighborKey = `${neighbor.x},${neighbor.y}`;

        if (!openSet.has(neighborKey) || tentativeCost < neighbor.cost) {
          neighbor.cost = tentativeCost;
          neighbor.heuristic = Pathfinder.heuristic(neighbor, end);
          neighbor.parent = currentNode;

          if (!openSet.has(neighborKey)) {
            openSet.set(neighborKey, neighbor);
          }
        }
      }
    }

    return null;
  }

  static getLowestCostNode(openSet) {
    let lowestCostNode = null;
    let lowestCost = Infinity;
    for (let node of openSet.values()) {
      const totalCost = node.totalCost;
      if (totalCost < lowestCost) {
        lowestCost = totalCost;
        lowestCostNode = node;
      }
    }
    return lowestCostNode;
  }

  static heuristic(node, goal) {
    // Distanza di Manhattan
    return Math.abs(node.x - goal.x) + Math.abs(node.y - goal.y);
  }

  static getNeighbors(grid, node) {
    const neighbors = [];
    const directions = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ];

    for (const dir of directions) {
      const x = node.x + dir.x;
      const y = node.y + dir.y;

      if (x >= 0 && x < grid.length && y >= 0 && y < grid[0].length && grid[x][y] === 0) {
        neighbors.push(new Node(x, y, Infinity, 0));
      }
    }

    return neighbors;
  }

  static reconstructPath(node) {
    const path = [];
    while (node !== null) {
      path.unshift([node.x, node.y]);
      node = node.parent;
    }
    return path;
  }
}

export class Node {
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
