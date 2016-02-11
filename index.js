'use strict';

(function() {
  var tileset = new Image();
  tileset.addEventListener('load', function() {
    initialize();
  });

  tileset.src = 'dqtiles.png';

  var options = {
    viewport: {
      width: 40,
      height: 40,
    },
    map: {
      width: 90,
      height: 90,
    },
  };

  var display = new ROT.Display({
    width: options.viewport.width,
    height: options.viewport.height,
    fontSize: 18,
    forceSquareRatio: true,
    layout: 'tile',
    bg: 'transparent',
    tileWidth: 16,
    tileHeight: 16,
    tileSet: tileset,
    tileColorize: true,
    tileMap: {
      player: [256, 18],
      enemy: [240, 18],
      wall: [1, 1],
      tree: [52, 18],
      floor: [35, 18],
      light: [137, 1],
    },
  });

  var dirs = {
    up: ROT.DIRS[4][0],  // up
    right: ROT.DIRS[4][1],  // right
    down: ROT.DIRS[4][2],  // down
    left: ROT.DIRS[4][3],  // left
  };

  var player = {
    char: 'player',
    x: 0,
    y: 0,
    lastMove: '',
    inventory: [],
    faction: 'human',
    friendlies: ['human'],
    hostiles: ['evil'],
    onItem: function() {
      this.inventory.push(item);
    },
  };

  var wizard = {
    char: 'wizard',
    x: 0,
    y: 0,
    lastMove: '',
    inventory: [],
    faction: 'human',
    friendlies: ['human'],
    hostiles: ['evil'],
  };

  var enemy = {
    char: 'enemy',
    x: 0,
    y: 0,
    lastMove: '',
    inventory: [],
    faction: 'evil',
    friendlies: [],
    hostiles: ['human'],
  };

  var initState = {};

  var mazeMap = new ROT.Map.DividedMaze(options.map.width, options.map.height);
  var roomsMap = new ROT.Map.Digger(options.map.width, options.map.height);
  var cellMap = new ROT.Map.Cellular(options.map.width, options.map.height);

  var map = [];
  var roomsGrid = [];

  // todo: make this an array
  var prettyGrid = [];
  var prettyGrid2 = [];
  var cellGrid = [];

  function initialize() {
    ROT.RNG.setSeed((new Date()).getTime());

    document.body.appendChild(
      display.getContainer()
    );

    roomsMap.create(mapGenCallback(prettyGrid));
    roomsMap.create(mapGenCallback(prettyGrid2));
    roomsMap.create(mapGenCallback(roomsGrid));

    var cellularIterations = 4;
    cellMap.randomize(0.5);
    for (var i = 0; i < cellularIterations; i++) {
      cellMap.create(mapGenCallback(cellGrid));
    }

    // combine maps
    for (var y = 0; y < roomsGrid.length; y++) {
      for (var x = 0; x < roomsGrid.length; x++) {
        if (!map[y]) {
          map[y] = [];
        }

        prettyGrid[y][x] = prettyGrid[y][x] ? 0 : 1;
        prettyGrid2[y][x] = prettyGrid2[y][x] ? 0 : 1;

        map[y][x] = !(roomsGrid[y][x] && cellGrid[y][x]) ? 0 : 'tree';

        if (map[y][x] && (prettyGrid[y][x] || prettyGrid2[y][x]) && ROT.RNG.getPercentage() > 33) {
          map[y][x] = 'wall';
        }
      }
    }

    var playerPosition = findRandomFloorSpace(map);
    player.x = playerPosition[0];
    player.y = playerPosition[1];

    var enemyPosition = findRandomFloorSpace(map);
    enemy.x = enemyPosition[0];
    enemy.y = enemyPosition[1];

    initState = {
      rng: ROT.RNG.getState(),
      player: {
        x: player.x,
        y: player.y,
      },
      enemy: {
        x: enemy.x,
        y: enemy.y,
      },
      map: map,
    };

    draw();

    document.addEventListener('keydown', function(event) {
      var temp;
      switch (event.keyCode) {
        case ROT.VK_UP:
          temp = {
            x: player.x + dirs.up[0],
            y: player.y + dirs.up[1],
          };
          break;
        case ROT.VK_RIGHT:
          temp = {
            x: player.x + dirs.right[0],
            y: player.y + dirs.right[1],
          };
          break;
        case ROT.VK_DOWN:
          temp = {
            x: player.x + dirs.down[0],
            y: player.y + dirs.down[1],
          };
          break;
        case ROT.VK_LEFT:
          temp = {
            x: player.x + dirs.left[0],
            y: player.y + dirs.left[1],
          };
          break;
        case ROT.VK_ESCAPE:
          resetState();
          break;
        default:
          break;
      }

      if (temp && isWalkable(temp.x, temp.y)) {
        playerMove(temp);
      }

    });
  }

  function mapGenCallback(m) {
    return function(x, y, isWall) {
      if (!m[y]) {
        m[y] = [];
      }
      // for value, 0 === floor; 1 === wall
      m[y][x] = isWall;
    };
  }

  function lightPassCallback(x, y) {
    if (map[y]) {
      return !map[y][x];
    } else {
      return false;
    }
  };

  var fov = new ROT.FOV.RecursiveShadowcasting(lightPassCallback);

  function findRandomFloorSpace(map) {
    var x;
    var y;
    do {
      x = ROT.RNG.getUniformInt(0, options.map.width - 1);
      y = ROT.RNG.getUniformInt(0, options.map.height - 1);
    } while (map[y][x] !== 0);
    return [x, y];
  }

  function playerMove(position) {
    player.x = position.x;
    player.y = position.y;
    draw();

    var target = {
      x: player.x,
      y: player.y,
    };

    var dijkstra = new ROT.Path.Dijkstra(
      target.x,
      target.y,
      isWalkable,
      { topology: 4 }
    );

    var pathToTarget = [];

    dijkstra.compute(
      enemy.x,
      enemy.y,
      function(x, y) {
        // this fn called once for
        // each step of the path
        pathToTarget.push([x, y]);
        // pathToTarget[0] will be the
        // enemy's start position!
      }
    );

    if (!(enemy.x === player.x && enemy.y === player.y)) {
      enemy.x = pathToTarget[1][0];
      enemy.y = pathToTarget[1][1];
    } else {
      console.log('Gotcha!');
    }
  }

  function draw() {
    var viewportTopLeft = getViewportTopLeft();

    display.clear();
    drawMap(map, viewportTopLeft);
    drawPlayer(player, viewportTopLeft);
    drawPlayer(enemy, viewportTopLeft);
  }

  function drawPlayer(player, viewportTopLeft) {
    fov.compute(
      player.x,
      player.y,
      10,
      function(x, y, r, visibility) {
        // var ch = (r ? "" : "@");
        // var color = (data[x+","+y] ? "#aa0": "#660");

        if (visibility && map[y] && !(x === player.x && y === player.y) && !map[y][x]) {
          // var char = map[y][x] ? map[y][x] : 'floor';
          var char = 'floor';
          display.draw(x - viewportTopLeft.x, y - viewportTopLeft.y, char, 'transparent');
        }
        // x, y - coordinates of this space
        // r - distance from starting point
        // visibility - light amount, 0...1
      }
    );

    display.draw(player.x - viewportTopLeft.x, player.y - viewportTopLeft.y, ['floor', player.char], 'transparent');
  }

  function drawMap(map, viewportTopLeft) {

    // y first!
    for (var y = 0; y < options.viewport.height; y++) {
      for (var x = 0; x < options.viewport.width; x++) {
        var mapX = x + viewportTopLeft.x;
        var mapY = y + viewportTopLeft.y;

        var char = map[mapY][mapX] ? map[mapY][mapX] : 'floor';
        display.draw(x, y, char, 'transparent');
      }
    }
  }

  function getViewportTopLeft() {
    var viewportTopLeft = {
      x: player.x - (options.viewport.width / 2),
      y: player.y - (options.viewport.height / 2),
    };

    if (viewportTopLeft.x < 0) {
      viewportTopLeft.x = 0;
    }

    if (viewportTopLeft.y < 0) {
      viewportTopLeft.y = 0;
    }

    if (viewportTopLeft.x + options.viewport.width > options.map.width) {
      viewportTopLeft.x = options.map.width - options.viewport.width;
    }

    if (viewportTopLeft.y + options.viewport.height > options.map.height) {
      viewportTopLeft.y = options.map.height - options.viewport.height;
    }

    return viewportTopLeft;
  }

  function resetState() {
    ROT.RNG.setState(initState.rng);
    player.x = initState.player.x;
    player.y = initState.player.y;
    map = initState.map;
    draw();
  }

  function isWalkable(x, y) {
    if (x < 0) {
      return false;
    }

    if (x >= options.map.width) {
      return false;
    }

    if (y < 0) {
      return false;
    }

    if (y >= options.map.height) {
      return false;
    }

    if (map[y][x]) {
      return false;
    }

    return true;
  }

})();
