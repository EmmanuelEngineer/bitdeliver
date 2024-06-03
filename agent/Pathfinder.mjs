// Based on: https://lemborco.com/lesson/a-search-algorithm-program-in-nodejs/
import{Utilities as ut } from "./Utilities.js"

export class Pathfinder {
  static aStar(grid, start, end) {
   // console.log(grid)
    const openSet = [start];
    const closedSet = new Set();
    if(grid[end.x][end.y]==1){
      //console.log("Giá occupato",ut.printGridSE(grid,start,end))
          return null
    }
    let counter = 0;
    while (openSet.length > 0 && openSet) {
      try{
        counter++;
        //console.log(counter)
        //console.log(ut.printGridSE(grid,start,end))
      openSet.sort((a, b) => a.totalCost - b.totalCost);
      const currentNode = openSet.shift();
      if (currentNode.x === end.x && currentNode.y === end.y) {
        return this.reconstructPath(currentNode);
      }
      closedSet.add(currentNode);
      const neighbors = this.getNeighbors(grid, currentNode);
      for (const neighbor of neighbors) {
        //if (closedSet.has(neighbor)) continue;
        for(let setObj of closedSet){
          if(setObj.x == neighbor.x && setObj.y == neighbor.y) continue
        }
        const tentativeCost = currentNode.cost + 1;
        let not_found_before = !this.hasThing(closedSet,neighbor)
        if(this.hasThing(openSet,neighbor))
        not_found_before = false;
        if (not_found_before || tentativeCost < neighbor.cost) {
          neighbor.cost = tentativeCost;
          neighbor.heuristic = Pathfinder.heuristic(neighbor, end);
          neighbor.parent = currentNode;
          if (not_found_before) {
            openSet.push(neighbor);
          }
        }
      }
    }catch(err){console.log(err)}
  }
    return null; // No path found
  }

  static hasThing(set,node){
    let flag = false
    for(let setObj of set){
      if(setObj.x == node.x && setObj.y == node.y) {
        flag = true
      }
    }
    return flag
  }
  static heuristic(node, goal) {
    // Euclidean distance heuristic
    return Math.sqrt((node.x - goal.x) ** 2 + (node.y - goal.y) ** 2);
  }
  static getNeighbors(grid, node) {
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

