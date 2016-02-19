'use strict';

(function() {

  function SceneManager() {
    this.scenes = {};
    this.currentScene = null;
  };

  SceneManager.prototype.addScene = function (name, sceneObj) {
    if (!this.scenes[name]) {
      this.scenes[name] = sceneObj;
    }
  };

  SceneManager.prototype.load = function (sceneName) {
    if (this.scenes[sceneName]) {
      if (this.currentScene) {
        var self = this;
        this.currentScene.teardown(function () {
          self.currentScene = self.scenes[sceneName];
          self.currentScene.init();
        });
      } else {
        this.currentScene = this.scenes[sceneName];
        this.currentScene.init();
      }
    } else {
      console.log('No scene named', sceneName);
    }
  };

  var titleScene = {
    init: function () {
      this.handleKeys = function (event) {
        if (event.keyCode === ROT.VK_SPACE) {
          scenemanager.load('play');
        }
      };
      document.addEventListener('keydown', this.handleKeys);
      this.draw();
    },
    draw: function () {
      messages.innerHTML = 'Press space to play!';
    },
    teardown: function (callback) {
      document.removeEventListener('keydown', this.handleKeys);
      display.clear();
      callback();
    },
  };

  var playScene = {
    init: function () {
      this.generateMap();
      this.generatePlayers();

      this.initState = {
        rng: ROT.RNG.getState(),
        player: {
          x: this.player.x,
          y: this.player.y,
        },
        enemy: {
          x: this.enemy.x,
          y: this.enemy.y,
        },
        map: this.map,
      };

      this.fov = new ROT.FOV.RecursiveShadowcasting(this.lightPassCallback());

      this.handleKeys = (event) => {
        var temp;
        switch (event.keyCode) {
          case ROT.VK_UP:
            temp = {
              x: this.player.x + dirs.up[0],
              y: this.player.y + dirs.up[1],
            };
            break;
          case ROT.VK_RIGHT:
            temp = {
              x: this.player.x + dirs.right[0],
              y: this.player.y + dirs.right[1],
            };
            break;
          case ROT.VK_DOWN:
            temp = {
              x: this.player.x + dirs.down[0],
              y: this.player.y + dirs.down[1],
            };
            break;
          case ROT.VK_LEFT:
            temp = {
              x: this.player.x + dirs.left[0],
              y: this.player.y + dirs.left[1],
            };
            break;
          case ROT.VK_ESCAPE:
            resetState();
            break;
          default:
            break;
        }

        if (temp && this.isWalkable(temp.x, temp.y)) {
          this.movePlayer(this.player, temp);
          this.enemyMove();
        }

      };

      document.addEventListener('keydown', this.handleKeys);
      this.draw();
    },

    generateMap: function() {
      var mazeMap = new ROT.Map.DividedMaze(options.map.width, options.map.height);
      var roomsMap = new ROT.Map.Digger(options.map.width, options.map.height);
      var cellMap = new ROT.Map.Cellular(options.map.width, options.map.height);

      this.map = [];
      var roomsGrid = [];

      // todo: make this an array
      var prettyGrid = [];
      var prettyGrid2 = [];
      var cellGrid = [];

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
          if (!this.map[y]) {
            this.map[y] = [];
          }

          prettyGrid[y][x] = prettyGrid[y][x] ? 0 : 1;
          prettyGrid2[y][x] = prettyGrid2[y][x] ? 0 : 1;

          // // sorta open map
          // map[y][x] = !(roomsGrid[y][x] && cellGrid[y][x]) ? 0 : 'tree';
          this.map[y][x] = roomsGrid[y][x] ? 'tree' : 0;

          if (this.map[y][x] && (prettyGrid[y][x] || prettyGrid2[y][x]) && ROT.RNG.getPercentage() > 33) {
            this.map[y][x] = 'wall';
          }
        }
      }
    },

    generatePlayers: function() {
      this.player = {
        char: 'player',
        x: 0,
        y: 0,
        power: 10,
        health: 100,
        maxHealth: 100,
        lastMove: '',
        inventory: [],
        faction: 'human',
        friendlies: ['human'],
        hostiles: ['evil'],
        onItem: function(item) {
          this.inventory.push(item);
        },
        onHostile: function(enemy) {
          enemy.damage(this.power);
        },
        damage: function(points) {
          this.health = Math.max(0, this.health - points);
          console.log(this.health);
          if (this.health === 0) {
            this.die();
          }
        },
        die: function() {
          this.char = 'dead';
        },
      };

      this.enemy = {
        char: 'enemy',
        x: 0,
        y: 0,
        power: 10,
        health: 100,
        maxHealth: 100,
        lastMove: '',
        inventory: [],
        faction: 'evil',
        friendlies: [],
        hostiles: ['human'],
        onHostile: function(enemy) {
          enemy.damage(this.power);
        },
        damage: function(points) {
          this.health = Math.max(0, this.health - points);
          console.log(this.health);
          if (this.health === 0) {
            this.die();
          }
        },
        die: function() {
          this.char = 'dead';
        },
      };

      this.existingCharacters = [
        this.player,
        this.enemy,
      ];

      var playerPosition = this.findRandomFloorSpace(this.map);
      this.player.x = playerPosition[0];
      this.player.y = playerPosition[1];

      var enemyPosition = this.findRandomFloorSpace(this.map);
      this.enemy.x = enemyPosition[0];
      this.enemy.y = enemyPosition[1];
    },

    lightPassCallback: function() {
      var self = this;

      return function(x, y) {
        if (self.map[y]) {
          return !self.map[y][x];
        } else {
          return false;
        }
      };
    },

    findRandomFloorSpace: function(map) {
      var x;
      var y;
      do {
        x = ROT.RNG.getUniformInt(0, options.map.width - 1);
        y = ROT.RNG.getUniformInt(0, options.map.height - 1);
      } while (map[y][x] !== 0);
      return [x, y];
    },

    movePlayer: function(player, position) {
      var shouldMove = true;
      for (var i = 0; i < this.existingCharacters.length; i++) {
        var otherPlayer = this.existingCharacters[i];

        if (player !== otherPlayer && this.isSameCoords(position.x, position.y, otherPlayer.x, otherPlayer.y)) {
          shouldMove = false;
          if (player.hostiles.includes(otherPlayer.faction)) {
            player.onHostile(otherPlayer);
            console.log('Hostile move by %s against %s!', player.char, otherPlayer.char);
          }
        }
      }

      if (shouldMove) {
        player.x = position.x;
        player.y = position.y;
      }

      // check for overlap and interraction

      this.draw();
    },

    enemyMove: function() {
      var target = {
        x: this.player.x,
        y: this.player.y,
      };

      var self = this;
      var dijkstra = new ROT.Path.Dijkstra(
        target.x,
        target.y,
        function(x, y) {
          return self.isWalkable(x, y);
        },
        { topology: 4 }
      );

      var pathToTarget = [];

      dijkstra.compute(
        this.enemy.x,
        this.enemy.y,
        function(x, y) {
          pathToTarget.push([x, y]);
        }
      );


      // pathToTarget[0] is current position
      pathToTarget.shift();

      if (pathToTarget.length) {
        this.movePlayer(this.enemy, {
          x: pathToTarget[0][0],
          y: pathToTarget[0][1],
        });
      }
    },

    draw: function() {
      messages.innerHTML = 'play scene';
      var viewportTopLeft = this.getViewportTopLeft();

      display.clear();
      this.drawMap(this.map, viewportTopLeft);
      this.drawFov(this.player, viewportTopLeft);
      this.drawPlayer(this.player, viewportTopLeft);
      this.drawPlayer(this.enemy, viewportTopLeft);
    },

    drawPlayer: function(player, viewportTopLeft) {
      display.draw(player.x - viewportTopLeft.x, player.y - viewportTopLeft.y, ['floor', player.char], 'transparent');
    },

    drawFov: function(player, viewportTopLeft) {
      var self = this;
      this.fov.compute(
        player.x,
        player.y,
        10,
        function(x, y, r, visibility) {
          if (visibility && self.map[y] && !self.isSameCoords(player.x, player.y, x, y)) {
            var char = self.map[y][x] ? self.map[y][x] : 'floor';
            var charArray = [char];
            for (var i = 0; i < Math.round(r / 2); i++) {
              charArray.push('dark');
            }
            display.draw(x - viewportTopLeft.x, y - viewportTopLeft.y, charArray, 'transparent');
          }
        }
      );
    },

    drawMap: function(map, viewportTopLeft) {
      // y first!
      for (var y = 0; y < options.viewport.height; y++) {
        for (var x = 0; x < options.viewport.width; x++) {
          var mapX = x + viewportTopLeft.x;
          var mapY = y + viewportTopLeft.y;

          var char = map[mapY][mapX] ? map[mapY][mapX] : 'floor';
          var charArray = [char];
          for (var i = 0; i < 4; i++) {
            charArray.push('dark');
          }
          display.draw(x, y, charArray, 'transparent');
        }
      }
    },

    getViewportTopLeft: function() {
      var viewportTopLeft = {
        x: this.player.x - (options.viewport.width / 2),
        y: this.player.y - (options.viewport.height / 2),
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
    },

    resetState: function() {
      ROT.RNG.setState(initState.rng);
      player.x = initState.player.x;
      player.y = initState.player.y;
      map = initState.map;
      this.draw();
    },

    isSameCoords: function(x1, y1, x2, y2) {
      return (x1 === x2 && y1 === y2);
    },

    areEntitiesOverlapping: function(e1, e2) {
      return this.isSameCoords(e1.x, e1.y, e2.x, e2.y);
    },

    isWalkable: function(x, y) {
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

      if (this.map[y][x]) {
        return false;
      }

      return true;
    },

    teardown: function(callback) {
      document.removeEventListener('keydown', this.handleKeys);
      display.clear();
      callback();
    },
  };

  var scenemanager = new SceneManager();
  scenemanager.addScene('title', titleScene);
  scenemanager.addScene('play', playScene);
  // scenemanager.addScene('win', winScene);

  var tileset = new Image();
  tileset.addEventListener('load', function() {
    initialize();
    scenemanager.load('title');
  });

  tileset.src = 'dqtiles.png';

  var messages = document.createElement('div');

  var options = {
    viewport: {
      width: 40,
      height: 40,
    },
    map: {
      width: 40,
      height: 40,
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
      dead: [101, 18],
      light: [137, 1],
      dark: [188, 1],
    },
  });

  var dirs = {
    up: ROT.DIRS[4][0],  // up
    right: ROT.DIRS[4][1],  // right
    down: ROT.DIRS[4][2],  // down
    left: ROT.DIRS[4][3],  // left
  };

  function initialize() {
    ROT.RNG.setSeed((new Date()).getTime());

    document.body.appendChild(display.getContainer());
    document.body.appendChild(messages);
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

})();
