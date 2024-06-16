export class Utilities {
  static printGrid(grid) {
    let string = ""
    //grid = this.rotateMatrix(grid)
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

  static printGridSE(grid, start, end) {
    //console.log("START",start,"END",end)
    let string = ""
    let copy = JSON.parse(JSON.stringify(grid));
    copy[start.x][start.y] = 3
    copy[end.x][end.y] = 4
    //grid = this.rotateMatrix(grid)
    for (const row of copy) {
      let rowString = '\n';
      for (const element of row) {
        let character;
        if (element == 0) character = "🟩";
        else if (element == 1) character = "🟥";
        else if (element == 3) character = "🤖";
        else if (element == 4) character = "🏁";
        rowString += character;
      }
      string += rowString.trim()
      string += "\n"
    }
    return string
  }

  static printGridSEPath(grid, start, end, path) {
    //console.log("START",start,"END",end)
    let string = ""
    let copy = JSON.parse(JSON.stringify(grid));
    for (let x of path) {
      copy[x[0]][x[1]] = 5
    }
    copy[start.x][start.y] = 3
    copy[end.x][end.y] = 4
    //grid = this.rotateMatrix(grid)
    for (const row of copy) {
      let rowString = '\n';
      for (const element of row) {
        let character;
        if (element == 0) character = "🟩";
        else if (element == 1) character = "🟥";
        else if (element == 3) character = "🤖";
        else if (element == 4) character = "🏁";
        else if (element == 5) character = "🟦";

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



  static initializeMatrix(n, m) {
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

  static generategrid(map, agents, consider_partner) {
    let grid;
    //the agent position is needed to consider the paths non available
    grid = this.initializeMatrix(map.height, map.width)
    for (let tile of map.tiles) {
      grid[tile.x][tile.y] = 0;
    }
    for (let agent of agents) {
      if (agent == undefined) continue
      try {
        if (global.me.id != agent.id && (consider_partner || agent.id != global.communication.partner_id))
          //mark obstacles on the grid
          grid[Math.round(agent.x)][Math.round(agent.y)] = 1;
      } catch (err) { console.log("ERROR ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️", ut.printBeliefAgents, err) }
    }
    //console.log(this.printGrid(grid))
    return grid;
  }

  static mapToJSON = (map) => {
    const obj = Object.fromEntries(map);
    return JSON.stringify(obj);
  };

  static jsonToMap = (jsonString) => {
    const obj = JSON.parse(jsonString);
    return new Map(Object.entries(obj));
  };

  static printBeliefAgents = (beliefset) => Array.from(beliefset.values()).map(({ id, x, y, name, reward, time, carriedBy }) => {
    return `${id}:${name},${x},${y},${reward},${time},${carriedBy}\n`;
  }).join(' ');


  static printBeliefParcels = (beliefset) => Array.from(beliefset.values()).map(({ id, x, y, reward, time, viewable, carriedBy }) => {
    return `${id}:${x},${y},${reward},${time},${viewable},${carriedBy}\n`;
  }).join(' ');

  static logStackTrace() {
    const err = new Error('Stack trace');
    Error.captureStackTrace(err);
    console.error(err.stack);
  }



}