// Based on: https://lemborco.com/lesson/a-search-algorithm-program-in-nodejs/
export class Pathfinder {
  constructor(row, height) {
    this.rows = row
    this.columns = height

  }

  static printGrid(grid) {
    let string = ""
    grid = this.rotateMatrix(grid)
    for (const row of grid) {
      let rowString = '\n';
      for (const element of row) {
        let character;
        if (element == 0) character = "🟩";
        else character = "🟥";
        rowString += character;
      }
      string += rowString.trim()
      string += "\n"
    }
    return string
  }

  static printGridSE(grid,start,end) {
    let string = ""
    grid[start.x][start.y] = 3
    grid[end.x][end.y] = 4

    grid = this.rotateMatrix(grid)
    for (const row of grid) {
      let rowString = '\n';
      for (const element of row) {
        let character;
        if (element == 0) character = "🟩";
        else if(element ==1) character = "🟥";
        else if(element ==3) character = "🤖";
        else if(element ==4) character = "🏁";
        rowString += character;
      }
      string += rowString.trim()
      string += "\n"
    }
    return string
  }

  static text_printGrid(grid) {
    let string = "["
    for (const row of grid) {
      let rowString = '[\n';
      for (const element of row) {

        rowString += element + ',';
      }
      rowString += "]"
      string += rowString.trim()
      string += "\n"
    }
    string += "]"
    return string
  }
  aStar(grid, start, end) {
    const openSet = [start];
    const closedSet = new Set();
    console.log(start,end)
    console.log(Pathfinder.printGridSE(grid,start,end))
    while (openSet.length > 0) {
      //console.log("################################")

      openSet.sort((a, b) => a.totalCost - b.totalCost);
      const currentNode = openSet.shift();

      if (currentNode.x === end.x && currentNode.y === end.y) {
        return this.reconstructPath(currentNode);
      }

      closedSet.add(currentNode);
      const neighbors = this.getNeighbors(grid, currentNode);
      for (const neighbor of neighbors) {
        if (closedSet.has(neighbor)) continue;

        const tentativeCost = currentNode.cost + 1;
        if (!openSet.includes(neighbor) || tentativeCost < neighbor.cost) {
          neighbor.cost = tentativeCost;
          neighbor.heuristic = this.heuristic(neighbor, end);
          neighbor.parent = currentNode;

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    return null; // No path found
  }

  heuristic(node, goal) {
    // Euclidean distance heuristic
    return Math.sqrt((node.x - goal.x) ** 2 + (node.y - goal.y) ** 2);
  }

  getNeighbors(grid, node) {
    const neighbors = [];
    const dx = [-1, 1, 0, 0];
    const dy = [0, 0, -1, 1];

    for (let i = 0; i < 4; i++) {
      const x = node.x + dx[i];
      const y = node.y + dy[i];
      if (x >= 0 && x < this.rows && y >= 0 && y < this.columns && grid[x][y] === 0) {
        neighbors.push(new Node(x, y, 0, 0));
      }
    }

    return neighbors;
  }

  reconstructPath(node) {
    const path = [];
    while (node !== null) {
      path.unshift([node.x, node.y]);
      node = node.parent;
    }
    return path;
  }
  initializeMatrix(n, m) {
    const matrix = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < m; j++) {
        row.push(1); // Pushing a list containing the number 1
      }
      matrix.push(row);
    }
    return matrix;
  }
  generategrid(map, agents) {
    let grid;
    //the agent position is needed to consider the paths non available
    grid = this.initializeMatrix(map.height, map.width)
    console.log(map.height, map.width)
    for (let tile of map.tiles) {
      grid[tile.x][tile.y] = 0;
    }
    if (agents)
      for (let agent of agents) {
        grid[agent.x][agent.y] = 1;
      }
    return grid;
  }

  static rotateMatrix(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;

    // Step 1: Transpose the matrix
    for (let i = 0; i < rows; i++) {
      for (let j = i; j < cols; j++) {
        [matrix[i][j], matrix[j][i]] = [matrix[j][i], matrix[i][j]];
      }
    }
    matrix.reverse()


    return matrix;
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


