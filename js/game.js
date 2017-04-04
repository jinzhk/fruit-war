// requestAnimationFrame shim
(function(window) {
	var lastTime = 0;
	var vendors = ['ms', 'moz', 'webkit', 'o'];
	for (var x=0; x<vendors.length && !window.requestAnimationFrame; x++) {
		window.requestAnimationFrame = window[vendors[x] + "RequestAnimationFrame"];
		window.cancelAnimationFrame = 
			window[vendors[x] + "CancelAnimationFrame"]
			|| window[vendors[x] + "CancelRequestAnimationFrame"];
	}
	if (!window.requestAnimationFrame) {
		window.requestAnimationFrame = function(callback, element) {
			var currTime = new Date().getTime();
			var timeToCall = Math.max(0, 16 - (currTime - lastTime));
			var id = window.setTimeout(function() {
				typeof callback === "function" && callback(currTime + timeToCall);
			}, timeToCall);
			lastTime = currTime + timeToCall;
			return id;
		};
	}
	if (!window.cancelAnimationFrame) {
		window.cancelAnimationFrame = function(id) {
			window.clearTimeout(id);
		};
	}
})(this || window);
// box2d
var b2Vec2 = Box2D.Common.Math.b2Vec2;
var b2BodyDef = Box2D.Dynamics.b2BodyDef;
var b2Body = Box2D.Dynamics.b2Body;
var b2FixtureDef = Box2D.Dynamics.b2FixtureDef;
var b2Fixture = Box2D.Dynamics.b2Fixture;
var b2World = Box2D.Dynamics.b2World;
var b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;
var b2CircleShape = Box2D.Collision.Shapes.b2CircleShape;
var b2DebugDraw = Box2D.Dynamics.b2DebugDraw;
// game
var game = {
	init: function() {
		// 初始化元素对象
		game.initDom();

		// 初始化关卡
		levels.init();

		// 初始化加载页面内容
		loader.init();

		// 初始化鼠标响应事件
		mouse.init();

		// 加载所有的音效及背景音乐
		
		// 由 Gurdonark 创作的 "Kindergarten"
		// 由创意公用授权条款授权 http://ccmixter.org/files/gurdonark/26491
		game.backgroundMusic = loader.loadSound('audio/gurdonark-kindergarten');

		game.slingshotReleasedSound = loader.loadSound('audio/released');
		game.bounceSound = loader.loadSound('audio/bounce');
		game.breakSound = {
			'glass': loader.loadSound('audio/glassbreak'),
			'wood': loader.loadSound('audio/woodbreak')
		};

		// 显示欢迎界面
		game.showStartScreen();

		game.canvas = game.$canvas[0];
		game.ctx = game.canvas.getContext('2d');

		game.center = game.canvas.width / 4;
	},
	initDom: function() {
		game.$gameLayer = $('.game-layer');
		game.$screenGameStart = $('#screen-game-start');
		game.$screenLevelSelect = $('#screen-level-select');
		game.$screenScore = $('#screen-score');
		game.$screenEnding = $('#screen-ending');
		game.$score = $('#score');
		game.$canvas = $('#game-canvas');
		game.$btnToggleMusic = $('#btn-toggle-music');
		game.$btnRestartLevel = $('#btn-restart-level');
		// init events
		$('#btn-game-start', game.$screenGameStart).click(function() {
			game.showLevelScreen();
		});
		$('#play-current-level', game.$screenEnding).click(function() {
			game.restartLevel();
		});
		$('#play-next-level', game.$screenEnding).click(function() {
			game.startNextLevel();
		});
		$('#screen-show-level', game.$screenEnding).click(function() {
			game.showLevelScreen();
		});
		game.$btnToggleMusic.click(function() {
			game.toggleBackgroundMusic();
		});
		game.$btnRestartLevel.click(function() {
			game.restartLevel();
		});
	},
	showStartScreen: function() {
		game.$gameLayer.hide();
		game.$screenGameStart.show();
	},
	showLevelScreen: function() {
		game.$gameLayer.hide();
		game.$screenLevelSelect.show('slow');
	},
	showEndingScreen: function() {
		// 停止播放背景音乐
		game.stopBackgroundMusic();
		if (game.mode == "level-success") {
			if (game.currentLevel.no < levels.data.length-1) {
				$('.tip-message', game.$screenEnding).html('你通过了这一关。恭喜！！！');
				$('#play-next-level', game.$screenEnding).show();
			} else {
				$('.tip-message', game.$screenEnding).html('你通过了所有关卡。干得漂亮！！！');
				$('#play-next-level', game.$screenEnding).hide();
			}
		} else if (game.mode == "level-failure") {
			$('.tip-message', game.$screenEnding).html('失败了。重玩?');
			$('#play-next-level', game.$screenEnding).hide();
		}
		game.$screenEnding.show();
	},
	start: function() {
		game.$gameLayer.hide();
		// 显示游戏画布和得分
		game.$canvas.show();
		game.$screenScore.show();

		// 开始播放背景音乐
		game.startBackgroundMusic();

		game.mode = "intro";
		game.offsetLeft = 0;
		game.ended = false;
		game.animationFrame = window.requestAnimationFrame(game.animate, game.canvas);
	},
	restartLevel: function() {
		// 停止动画
		window.cancelAnimationFrame(game.animationFrame);
		game.lastUpdateTime = undefined;
		// 重新加载当前关卡
		var currentLevelNo = game.currentLevel ? game.currentLevel.no || 0 : 0;
		levels.load(currentLevelNo);
	},
	startNextLevel: function() {
		// 停止动画
		window.cancelAnimationFrame(game.animationFrame);
		game.lastUpdateTime = undefined;
		// 加载下一关
		var currentLevelNo = game.currentLevel ? game.currentLevel.no || 0 : 0;
		if (currentLevelNo == levels.data.length - 1) {
			levels.load(0);
		} else {
			levels.load(currentLevelNo + 1);
		}
	},
	// 弹弓的 X 和 Y 坐标
	slingshotX: 140,
	slingshotY: 280,
	// 画面最大平移速度，单位为像素每帧
	maxSpeed: 3,
	// 画面最大和最小平移范围
	minOffset: 0,
	maxOffset: 300,
	// 画面当前平移位置
	offsetLeft: 0,
	// 游戏得分
	score: 0,
	// 默认画面中心
	center: 0,
	// 画面中心平移到 newCenter
	panTo: function(newCenter) {
		if (Math.abs(newCenter - game.offsetLeft - game.center) > 0 
			&& game.offsetLeft <= game.maxOffset && game.offsetLeft >= game.minOffset) {
			var deltaX = Math.round((newCenter - game.offsetLeft - game.center)/2);
			if (deltaX && Math.abs(deltaX) > game.maxSpeed) {
				deltaX = game.maxSpeed*Math.abs(deltaX)/deltaX;
			}
			game.offsetLeft += deltaX;
		} else {
			return true;
		}
		if (game.offsetLeft < game.minOffset) {
			game.offsetLeft = game.minOffset;
			return true;
		}
		if (game.offsetLeft > game.maxOffset) {
			game.offsetLeft = game.maxOffset;
			return true;
		}
		return false;
	},
	// 游戏阶段 
	// - "intro"            关卡刚刚载入，游戏将在整个关卡范围内平移游戏画面，向玩家展现关卡中的所有东西
	// - "load-next-hero"   检查是否有下一个英雄可以装填到弹弓上去，如果有，装填该英雄。如果我们的英雄耗尽了而坏蛋却没有被全部消灭，关卡就结束了
	// - "wait-for-firing"  将视野移回到弹弓，等待玩家发射“英雄”。此时，游戏正在等待玩家单击英雄。在这个阶段，玩家可以也很有可能用鼠标拖拽画面，查看整个关卡
	// - "firing"           在这个阶段，玩家已经单击了英雄，但还没有释放鼠标按键。此时，游戏正在等待玩家拖拽英雄，调整角度和位置释放英雄
	// - "fired"            玩家释放了鼠标按键并发射英雄之后进入这个阶段。此时，游戏将所有的事情交给物理引擎来处理，用户仅仅在观看。游戏画面会随着发射出的英雄平移
	mode: "intro",
	handlePanning: function() {
		if (game.mode == "intro") {
			if (game.panTo(700)) {
				game.mode = "load-next-hero";
			}
		}
		if (game.mode == "wait-for-firing") {
			if (mouse.dragging) {
				if (game.mouseOnCurrentHero()) {
					game.mode = "firing";
				} else {
					game.panTo(mouse.x + game.offsetLeft);
				}
			} else {
				game.panTo(game.slingshotX);
			}
		}
		if (game.mode == "firing") {
			if (mouse.down) {
				game.panTo(game.slingshotX);
				game.currentHero.SetPosition({x: (mouse.x+game.offsetLeft)/box2d.scale, y: mouse.y/box2d.scale});
			} else {
				game.mode = "fired";
				// 播放释放音
				if (game.slingshotReleasedSound) {
					game.slingshotReleasedSound.play();
				}
				// 弹弓中心的坐标（橡胶带绑住弹弓的地方）
				var slignshotCenterX = game.slingshotX + 35;
				var slingshotCenterY = game.slingshotY + 25;
				// 推力放大因子
				var impulseScaleFactor = 0.75;
				// 推力向量的 x 和 y 值设定为英雄与弹弓顶部间的距离向量的 x 和 y 值的倍数
				var impulse = new b2Vec2((slignshotCenterX-mouse.x-game.offsetLeft)*impulseScaleFactor, (slingshotCenterY-mouse.y)*impulseScaleFactor);
				// 对英雄施加推力
				game.currentHero.ApplyImpulse(impulse, game.currentHero.GetWorldCenter());
			}
			
		}
		if (game.mode == "fired") {
			// 跟随当前移动画面
			var heroX = game.currentHero.GetPosition().x * box2d.scale;
			game.panTo(heroX);
			// 直到英雄停止移动或移出边界
			if (!game.currentHero.IsAwake() || heroX<0 || heroX > game.currentLevel.foregroundImage.width) {
				// 然后删除旧的英雄
				box2d.world.DestroyBody(game.currentHero);
				game.currentHero = undefined;
				// 加载下一个英雄
				game.mode = "load-next-hero";
			}
		}
		if (game.mode == "load-next-hero") {
			game.countHeroesAndVillains();

			// 检查是否有坏蛋还活着，如果没有，结束关卡（胜利）
			if (game.villains.length == 0) {
				game.mode = "level-success";
				return;
			}
			// 检查是否还有可装填英雄，如果没有，结束关卡（失败）
			if (game.heroes.length == 0) {
				game.mode = "level-failure";
				return;
			}
			// 装填英雄，设置状态为 "wait-for-firing"
			if (!game.currentHero) {
				game.currentHero = game.heroes[game.heroes.length - 1];
				game.currentHero.SetPosition({x: 180/box2d.scale, y: 200/box2d.scale});
				game.currentHero.SetLinearVelocity({x: 0, y: 0}); // 线速度设为 0
				game.currentHero.SetAngularVelocity(0); // 角度设为 0
				game.currentHero.SetAwake(true); // 唤醒
			} else {
				// 等待英雄结束弹跳并进入休眠，接着切换到 wait-for-firing 阶段
				game.panTo(game.slingshotX);
				if (!game.currentHero.IsAwake()) {
					game.mode = "wait-for-firing";
				}
			}
		}
		if (game.mode == "level-success" || game.mode == "level-failure") {
			if (game.panTo(0)) {
				game.ended = true;
				game.showEndingScreen();
			}
		}
	},
	animate: function() {
		// 移动背景
		game.handlePanning();

		// 使角色运动
		var currentTime = new Date().getTime();
		var timeStep;
		if (game.lastUpdateTime) {
			timeStep = (currentTime - game.lastUpdateTime)/1000;
			box2d.step(timeStep);
		}
		game.lastUpdateTime = currentTime;
		
		// 使用视差滚动绘制背景
		game.ctx.drawImage(game.currentLevel.backgroundImage, game.offsetLeft/4, 0, 640, 480, 0, 0, 640, 480);
		game.ctx.drawImage(game.currentLevel.foregroundImage, game.offsetLeft, 0, 640, 480, 0, 0, 640, 480);

		// 绘制弹弓的外侧支架
		game.ctx.drawImage(game.slingshotImage, game.slingshotX-game.offsetLeft, game.slingshotY);

		// 绘制所有的物体
		game.drawAllBodies();

		// 发射英雄时绘制胶带
		if (game.mode == "firing") {
			game.drawSlingshotBand();
		}

		// 绘制弹弓的前景
		game.ctx.drawImage(game.slingshotFrontImage, game.slingshotX-game.offsetLeft, game.slingshotY);

		if (!game.ended) {
			game.animationFrame = window.requestAnimationFrame(game.animate, game.canvas);
		}
	},
	drawSlingshotBand: function() {
		game.ctx.strokeStyle = "rgb(68, 31, 11)"; // 暗棕色
		game.ctx.lineWidth = 6; // 粗线

		// 用英雄被拖拽的角度和半径计算英雄的末端，相对于英雄的中心
		var radius = game.currentHero.GetUserData().radius;
		var heroX = game.currentHero.GetPosition().x*box2d.scale;
		var heroY = game.currentHero.GetPosition().y*box2d.scale;
		var angle = Math.atan2(game.slingshotY+25-heroY, game.slingshotX+50-heroX);

		var heroFarEdgeX = heroX - radius * Math.cos(angle);
		var heroFarEdgeY = heroY - radius * Math.sin(angle);

		game.ctx.beginPath();

		// 从弹弓顶端开始绘制（背面）
		game.ctx.moveTo(game.slingshotX+50-game.offsetLeft, game.slingshotY + 25);

		// 画到英雄的中心
		game.ctx.lineTo(heroX - game.offsetLeft, heroY);
		game.ctx.stroke();

		// 再次绘制英雄
		entities.draw(game.currentHero.GetUserData(), game.currentHero.GetPosition(), game.currentHero.GetAngle());

		game.ctx.beginPath();

		// 移动到英雄离弹弓顶部最远的边缘
		game.ctx.moveTo(heroFarEdgeX-game.offsetLeft, heroFarEdgeY);

		// 将线画回弹弓（正面）
		game.ctx.lineTo(game.slingshotX-game.offsetLeft+10, game.slingshotY+30);
		game.ctx.stroke();
	},
	drawAllBodies: function() {
		// box2d.world.DrawDebugData();
		// 遍历所有的物体，并在游戏 canvas 上绘制出来
		for (var body = box2d.world.GetBodyList(); body; body = body.GetNext()) {
			var entity = body.GetUserData();
			if (entity) {
				var entityX = body.GetPosition().x*box2d.scale;
				if (entityX < 0 || entityX > game.currentLevel.foregroundImage.width || (entity.health && entity.health < 0)) {
					box2d.world.DestroyBody(body);
					if (entity.type == "villain") {
						game.score += entity.calories;
						game.$score.html('Score: ' + game.score);
					}
					// 播放摧毁音
					if (entity.breakSound) {
						entity.breakSound.play();
					}
				} else {
					entities.draw(entity, body.GetPosition(), body.GetAngle());
				}
			}
		}
	},
	countHeroesAndVillains: function() {
		game.heroes = [];
		game.villains = [];
		for (var body = box2d.world.GetBodyList(); body; body = body.GetNext()) {
			var entity = body.GetUserData();
			if (entity) {
				if (entity.type == "hero") {
					game.heroes.push(body);
				} else if (entity.type == "villain") {
					game.villains.push(body);
				}
			}
		}
	},
	mouseOnCurrentHero: function() {
		if (!game.currentHero) {
			return false;
		}
		// 计算当前英雄的中心与鼠标之间的距离，并与英雄的半径进行比较，以确定鼠标是否悬停在英雄上
		var position = game.currentHero.GetPosition();
		var distanceSquared = Math.pow(position.x*box2d.scale - mouse.x - game.offsetLeft, 2) + Math.pow(position.y*box2d.scale - mouse.y, 2);
		var radiusSquared = Math.pow(game.currentHero.GetUserData().radius, 2);
		return (distanceSquared <= radiusSquared);
	},
	startBackgroundMusic: function() {
		var btnToggleMusic = game.$btnToggleMusic[0];
		if (game.backgroundMusic) {
			game.backgroundMusic.play();
		}
		btnToggleMusic.src = "images/icons/sound.png";
	},
	stopBackgroundMusic: function() {
		var btnToggleMusic = game.$btnToggleMusic[0];
		btnToggleMusic.src = "images/icons/nosound.png";
		if (game.backgroundMusic) {
			game.backgroundMusic.pause();
			game.backgroundMusic.currentTime = 0; // 回到音乐的开始位置
		}
	},
	toggleBackgroundMusic: function() {
		var btnToggleMusic = game.$btnToggleMusic[0];
		if (game.backgroundMusic) {
			if (game.backgroundMusic.paused) {
				game.backgroundMusic.play();
				btnToggleMusic.src = "images/icons/sound.png";
			} else {
				game.backgroundMusic.pause();
				btnToggleMusic.src = "images/icons/nosound.png";
			}
		}
	},
	$gameLayer: null,
	$screenGameStart: null,
	$screenLevelSelect: null,
	$screenScore: null,
	$screenEnding: null,
	$score: null,
	$canvas: null,
	$btnToggleMusic: null,
	$btnRestartLevel: null
};
var levels = {
	data: [
		// 第一关
		{
			foreground: 'desert-foreground',
			background: 'clouds-background',
			entities: [
				// 地面
				{type: "ground", name: "dirt", x: 500, y: 440, width: 1000, height: 20, isStatic: true},
				// 弹弓
				{type: "ground", name: "wood", x: 180, y: 390, width: 40, height: 80, isStatic: true},

				// 第一排障碍物
				{type: "block", name: "wood", x: 520, y: 380, angle: 90, width: 100, height: 25},
				{type: "block", name: "glass", x: 520, y: 280, angle: 90, width: 100, height: 25},
				{type: "villain", name: "burger", x: 520, y: 205, calories: 590},

				// 第二排障碍物
				{type: "block", name: "wood", x: 620, y: 380, angle: 90, width: 100, height: 25},
				{type: "block", name: "glass", x: 620, y: 280, angle: 90, width: 100, height: 25},
				{type: "villain", name: "fries", x: 620, y: 205, calories: 420},

				// 英雄
				{type: "hero", name: "orange", x: 74, y: 405},
				{type: "hero", name: "apple", x: 134, y: 405}
			]
		},
		// 第二关
		{
			foreground: 'desert-foreground',
			background: 'clouds-background',
			entities: [
				// 地面
				{type: "ground", name: "dirt", x: 500, y: 440, width: 1000, height: 20, isStatic: true},
				// 弹弓
				{type: "ground", name: "wood", x: 180, y: 390, width: 40, height: 80, isStatic: true},

				// 第一排障碍物
				{type: "block", name: "wood", x: 820, y: 378, angle: 90, width: 100, height: 25},
				{type: "block", name: "wood", x: 720, y: 378, angle: 90, width: 100, height: 25},
				{type: "block", name: "wood", x: 620, y: 378, angle: 90, width: 100, height: 25},
				{type: "block", name: "glass", x: 670, y: 314, width: 100, height: 25},
				{type: "block", name: "glass", x: 770, y: 314, width: 100, height: 25},

				// 第二排障碍物
				{type: "block", name: "glass", x: 670, y: 252, angle: 90, width: 100, height: 25},
				{type: "block", name: "glass", x: 770, y: 252, angle: 90, width: 100, height: 25},
				{type: "block", name: "wood", x: 720, y: 188, width: 100, height: 25},

				// 坏蛋
				{type: "villain", name: "burger", x: 715, y: 150, calories: 590},
				{type: "villain", name: "fries", x: 670, y: 403, calories: 420},
				{type: "villain", name: "sodacan", x: 765, y: 398, calories: 150},

				// 英雄
				{type: "hero", name: "strawberry", x: 26, y: 415},
				{type: "hero", name: "orange", x: 76, y: 405},
				{type: "hero", name: "apple", x: 136, y: 405}
			]
		}
	],
	init: function() {
		levels.$screen = $('#screen-level-select');

		var html = "";
		for (var i=0; i<levels.data.length; i++) {
			var level = levels.data[i];
			html += ('<input type="button" value="' + (i + 1) + '">');
		}
		levels.$screen.html(html);

		levels.$screen.find('input').click(function() {
			levels.load(this.value - 1);
			levels.$screen.hide();
		});
	},
	load: function(number) {
		// 关卡加载时，初始化 Box2D 世界
		box2d.init();

		// 声明当前关卡对象
		game.currentLevel = {no: number, hero: []};
		game.score = 0;
		game.$score.html('Score: ' + game.score);
		game.currentHero = undefined;

		var level = levels.data[number];

		// 加载背景、前景和弹弓图像
		game.currentLevel.backgroundImage = loader.loadImage("images/backgrounds/" + level.background + ".png");
		game.currentLevel.foregroundImage = loader.loadImage("images/backgrounds/" + level.foreground + ".png");
		game.slingshotImage = loader.loadImage("images/slingshot.png");
		game.slingshotFrontImage = loader.loadImage("images/slingshot-front.png");

		// 加载所有物体
		for (var i=level.entities.length - 1; i >= 0; i--) {
			var entity = level.entities[i];
			entities.create(entity);
		}

		// 一旦资源加载完成，调用 game.start()
		if (loader.loaded) {
			game.start();
		} else {
			loader.onload = game.start;
		}
	},
	$screen: null
};
var loader = {
	loaded: false,
	loadedCount: 0, // 已加载的资源数
	totalCount: 0, // 需要被加载的资源总数

	init: function() {
		// 初始化元素对象
		loader.initDom();

		// 检查浏览器支持的声音格式
		var mp3Support, oggSupport;
		var audio = document.createElement("audio");
		if (typeof audio.canPlayType === "function") {
			// 当前 canPlayType() 方法返回 ""、"maybe" 或 "probably"
			mp3Support = "" != audio.canPlayType("audio/mpeg");
			oggSupport = "" != audio.canPlayType('audio/ogg; codecs = "vorbis"');
		} else {
			// audio 标签不被支持
			mp3Support = false;
			oggSupport = false;
		}

		loader.soundFileExtn = oggSupport ? ".ogg" : (mp3Support ? ".mp3" : undefined);
	},

	initDom: function() {
		loader.$screen = $('#screen-loading');
		loader.$message = $('.tip-message', loader.$screen);
	},

	loadImage: function(url) {
		loader.totalCount ++;
		loader.loaded = false;
		loader.$screen.show();
		var img = new Image();
		img.src = url;
		img.onload = loader.itemLoaded;
		return img;
	},

	soundFileExtn: null,

	loadSound: function(url) {
		if (loader.soundFileExtn == null) return null;
		loader.totalCount ++;
		loader.loaded = false;
		loader.$screen.show();
		var audio = new Audio();
		audio.src = url + loader.soundFileExtn;
		audio.addEventListener("canplaythrough", loader.itemLoaded, false);
		return audio;
	},

	itemLoaded: function() {
		loader.loadedCount ++;
		loader.$message.html('Loaded ' + loader.loadedCount + ' of ' + loader.totalCount);
		if (loader.loadedCount >= loader.totalCount) {
			// loader 完成了资源加载
			loader.loaded = true;
			loader.loadedCount = loader.totalCount = 0;
			loader.$screen.hide();
			if (typeof loader.onload === "function") {
				loader.onload();
				delete loader.onload;
			}
		}
	},

	$screen: null,
	$message: null
};
var mouse = {
	x: 0,
	y: 0,
	down: false,
	downX: 0,
	downY: 0,
	dragging: false,
	init: function() {
		game.$canvas.mousemove(mouse.mousemovehandler);
		game.$canvas.mousedown(mouse.mousedownhandler);
		game.$canvas.mouseup(mouse.mouseuphandler);
		game.$canvas.mouseout(mouse.mouseuphandler);
	},
	mousemovehandler: function(evt) {
		if (mouse.down) {
			var offset = mouse.offset(evt);
			mouse.x = offset.left;
			mouse.y = offset.top;
			mouse.dragging = true;
		}
	},
	mousedownhandler: function(evt) {
		if (!mouse.down) {
			var offset = mouse.offset(evt);
			mouse.x = mouse.downX = offset.left;
			mouse.y = mouse.downY = offset.top;
			mouse.down = true;
		}
		evt.originalEvent && evt.originalEvent.preventDefault();
	},
	mouseuphandler: function(evt) {
		mouse.down = false;
		mouse.dragging = false;
	},
	offset: function(evt) {
		var _left, _top;
		if (evt.offsetX != null && evt.offsetY != null) {
			_left = evt.offsetX;
			_top = evt.offsetY;
		} else {
			var offset = game.$canvas.offset();
			_left = evt.pageX - offset.left;
			_top = evt.pageY - offset.top;
		}
		return {
			left: _left,
			top: _top
		};
	}
};
var entities = {
	definitions: {
		// 玻璃
		"glass": {
			fullHealth: 100,
			density: 2.4,
			friction: 0.4,
			restitution: 0.15
		},
		// 木材
		"wood": {
			fullHealth: 500,
			density: 0.7,
			friction: 0.4,
			restitution: 0.4
		},
		// 泥土（地面）
		"dirt": {
			density: 3.0,
			friction: 1.5,
			restitution: 0.2
		},
		// 汉堡
		"burger": {
			shape: "circle",
			fullHealth: 40,
			radius: 25,
			density: 1,
			friction: 0.5,
			restitution: 0.4
		},
		// 汽水罐
		"sodacan": {
			shape: "rectangle",
			fullHealth: 80,
			width: 40,
			height: 60,
			density: 1,
			friction: 0.5,
			restitution: 0.7
		},
		// 炸薯条
		"fries": {
			shape: "rectangle",
			fullHealth: 50,
			width: 40,
			height: 50,
			density: 1,
			friction: 0.5,
			restitution: 0.6
		},
		// 苹果
		"apple": {
			shape: "circle",
			radius: 25,
			density: 1.5,
			friction: 0.5,
			restitution: 0.4
		},
		// 桔子
		"orange": {
			shape: "circle",
			radius: 25,
			density: 1.5,
			friction: 0.5,
			restitution: 0.4
		},
		// 草莓
		"strawberry": {
			shape: "circle",
			radius: 15,
			density: 2.0,
			friction: 0.5,
			restitution: 0.4
		}
	},
	// 以物体作为参数，创建一个 Box2D 物体，并加入世界
	create: function(entity) {
		var definition = entities.definitions[entity.name];
		if (!definition) {
			console.log('Undefined entity name', entity.name);
			return;
		}
		switch (entity.type) {
			case "block": // 障碍物
				entity.health = definition.fullHealth;
				entity.fullHealth = definition.fullHealth;
				entity.shape = "rectangle";
				entity.sprite = loader.loadImage("images/entities/" + entity.name + ".png");
				entity.breakSound = game.breakSound[entity.name];
				box2d.createRectangle(entity, definition);
				break;
			case "ground": // 地面
				// 不可摧毁物体，不必具有生命值
				entity.shape = "rectangle";
				// 不会被画出，所以不必具有图像
				if (entity.name == "dirt") {
					game.currentGround = box2d.createRectangle(entity, definition);
				} else {
					box2d.createRectangle(entity, definition);
				}
				break;
			case "hero": // 简单的圆
			case "villain": // 可以是圆形或者矩形
				entity.health = definition.fullHealth;
				entity.fullHealth = definition.fullHealth;
				entity.sprite = loader.loadImage("images/entities/" + entity.name + ".png");
				entity.shape = definition.shape;
				entity.bounceSound = game.bounceSound;
				if (definition.shape == "circle") {
					entity.radius = definition.radius;
					box2d.createCircle(entity, definition);
				} else if (definition.shape == "rectangle") {
					entity.width = definition.width;
					entity.height = definition.height;
					box2d.createRectangle(entity, definition);
				}
				break;
			default:
				console.log('Undefined entity type', entity.type);
				break;
		}
	},
	// 以物体、物体的位置和角度为参数，在游戏画面中绘制物体
	draw: function(entity, position, angle) {
		game.ctx.translate(position.x*box2d.scale-game.offsetLeft, position.y*box2d.scale);
		game.ctx.rotate(angle);
		switch (entity.type) {
			case "block":
				game.ctx.drawImage(entity.sprite, 0, 0, entity.sprite.width, entity.sprite.height, -entity.width/2-1, -entity.height/2-1, entity.width+2, entity.height+2);
				break;
			case "villain":
			case "hero":
				if (entity.shape == "circle") {
					game.ctx.drawImage(entity.sprite, 0, 0, entity.sprite.width, entity.sprite.height, -entity.radius-1, -entity.radius-1, entity.radius*2+2, entity.radius*2+2);
				} else if (entity.shape == "rectangle") {
					game.ctx.drawImage(entity.sprite, 0, 0, entity.sprite.width, entity.sprite.height, -entity.width/2-1, -entity.height/2-1, entity.width+2, entity.height+2);
				}
				break;
			case "ground":
				// 什么都不做，我们单独绘制地面和弹弓
				break;
			default:
				break;
		}
		// 还原画笔方向和位置
		game.ctx.rotate(-angle);
		game.ctx.translate(-position.x*box2d.scale+game.offsetLeft, -position.y*box2d.scale);
	}
};
var box2d = {
	scale: 30, // 画布上像素与世界内的长度单位米的比例
	init: function() {
		// 创建 Box2D 世界，大部分物理运算将在其中完成
		var gravity = new b2Vec2(0, 9.8); // 将重力加速度设为 9.8m/s^2，方向向下
		var  allowSheep = true; // 允许静止的物体休眠以不参与计算
		box2d.world = new b2World(gravity, allowSheep);

		// 设置调试绘图
		var debugCtx = document.getElementById("debug-canvas").getContext('2d');
		var debugDraw = new b2DebugDraw();
		debugDraw.SetSprite(debugCtx);
		debugDraw.SetDrawScale(box2d.scale);
		debugDraw.SetFillAlpha(0.3);
		debugDraw.SetLineThickness(1.0);
		debugDraw.SetFlags(b2DebugDraw.e_shapeBit | b2DebugDraw.e_jointBit);
		box2d.world.SetDebugDraw(debugDraw);

		//碰撞监听
		var listener = new Box2D.Dynamics.b2ContactListener();
		listener.PostSolve = function(contact, impulse) {
			var body1 = contact.GetFixtureA().GetBody();
			var body2 = contact.GetFixtureB().GetBody();
			var entity1 = body1.GetUserData();
			var entity2 = body2.GetUserData();

			var impulseAlongNormal = Math.abs(impulse.normalImpulses[0]); // 法向冲撞力
			// 监听器被调用得有些太频繁了，滤去非常小的冲击
			// 尝试不同的值后，5 似乎比较好
			if (impulseAlongNormal > 5) {
				// 如果对象有生命值，用冲击值削弱生命值
				if (entity1.health) {
					entity1.health -= impulseAlongNormal;
				}

				if (entity2.health) {
					entity2.health -= impulseAlongNormal;
				}

				// 如果物体具有弹跳音，则播放它
				if (entity1.bounceSound) {
					entity1.bounceSound.play();
				}

				if (entity2.bounceSound) {
					entity2.bounceSound.play();
				}
			}
			// 如果当前英雄已经撞击到地面并且滚动的水平速度小于 1 时，则停止移动
			if (game.currentHero && game.mode == "fired") {
				var bHeroContactGround, bodyHero, bodyGround, entityHero, entityGround;
				if (entity1.type == "hero" && entity2.type == "ground" && entity2.name == "dirt") {
					bHeroContactGround = true;
					bodyHero = body1;
					bodyGround = body2;
					entityHero = entity1;
					entityGround = entity2;
				} else if (entity2.type == "hero" && entity1.type == "ground" && entity1.name == "dirt") {
					bHeroContactGround = true;
					bodyHero = body2;
					bodyGround = body1;
					entityHero = entity2;
					entityGround = entity1;
				}
				var minVelocityX = 1, minVelocityY = 0.1;
				if (bHeroContactGround && entityHero.radius) {
					var heroBottomY = Math.round(bodyHero.GetPosition().y * box2d.scale + entityHero.radius),
						groundTopY = Math.round(bodyGround.GetPosition().y * box2d.scale - entityGround.height/2),
						velocityX = Math.abs(bodyHero.GetLinearVelocity().x),
						velocityY = Math.abs(bodyHero.GetLinearVelocity().y);
					if (heroBottomY == groundTopY && velocityX < minVelocityX && velocityY < minVelocityY) {
						game.currentHero.SetAwake(false);
					}
				}
			}
		};
		box2d.world.SetContactListener(listener);
	},
	step: function(timeStep) {
		// 速度迭代数 8
		// 位置迭代数 3
		if (timeStep > 2/60) {
			timeStep = 2/60;
		}

		box2d.world.Step(timeStep, 8, 3);
	},
	createRectangle: function(entity, definition) {
		var bodyDef = new b2BodyDef();
		if (entity.isStatic) {
			bodyDef.type = b2Body.b2_staticBody;
		} else {
			bodyDef.type = b2Body.b2_dynamicBody;
		}
		bodyDef.position.x = entity.x/box2d.scale;
		bodyDef.position.y = entity.y/box2d.scale;

		if (entity.angle) {
			bodyDef.angle = Math.PI*entity.angle/180;
		}

		var fixtureDef = new b2FixtureDef();
		fixtureDef.density = definition.density;
		fixtureDef.friction = definition.friction;
		fixtureDef.restitution = definition.restitution;

		fixtureDef.shape = new b2PolygonShape();
		fixtureDef.shape.SetAsBox(entity.width/2/box2d.scale, entity.height/2/box2d.scale);

		var body = box2d.world.CreateBody(bodyDef);
		body.SetUserData(entity);

		var fixture = body.CreateFixture(fixtureDef);

		return body;
	},
	createCircle: function(entity, definition) {
		var bodyDef = new b2BodyDef();
		if (entity.isStatic) {
			bodyDef.type = b2Body.b2_staticBody;
		} else {
			bodyDef.type = b2Body.b2_dynamicBody;
		}
		bodyDef.position.x = entity.x/box2d.scale;
		bodyDef.position.y = entity.y/box2d.scale;

		if (entity.angle) {
			bodyDef.angle = Math.PI*entity.angle/180;
		}

		var fixtureDef = new b2FixtureDef;
		fixtureDef.density = definition.density;
		fixtureDef.friction = definition.friction;
		fixtureDef.restitution = definition.restitution;

		fixtureDef.shape = new b2CircleShape(entity.radius/box2d.scale);

		var body = box2d.world.CreateBody(bodyDef);
		body.SetUserData(entity);

		var fixture = body.CreateFixture(fixtureDef);

		return body;
	}
};
$(function() {
	game.init();
});