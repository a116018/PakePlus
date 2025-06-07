/*:
 * @plugindesc 简化版三和菜单（时段控制+状态联动）：自定义菜单 + 状态窗口 + HUD浮窗 + 手动推进时间 @ChatGPT优化
 */

(function () {
  //=== 工具函数 ===//
  const getText = (v, labels) => v >= 80 ? labels[0] : v >= 50 ? labels[1] : v >= 20 ? labels[2] : labels[3];
  const getColor = v => v >= 80 ? "#32CD32" : v >= 50 ? "#FFD700" : v >= 20 ? "#FF8C00" : "#FF4500";
  const getPeriodText = v => ["上午", "中午", "下午", "晚上"][v] || "";

  //=== 状态变量限制 & 自定义时间推进逻辑（含状态联动） ===//
  const _setVar = Game_Variables.prototype.setValue;
  Game_Variables.prototype.setValue = function(id, value) {
    if (id >= 1 && id <= 4) value = Math.max(0, Math.min(100, value));

    if (id === 8) {
      const oldPeriod = this.value(8);
      const oldDay = this.value(7);
      const oldMonth = this.value(6);
      const oldYear = this.value(5);

      let period = value;
      let day = oldDay;
      let month = oldMonth;
      let year = oldYear;

      if (period > 3) { period = 0; day += 1; }
      if (day > 30) { day = 1; month += 1; }
      if (month > 12) { month = 1; year += 1; }

      _setVar.call(this, 5, year);
      _setVar.call(this, 6, month);
      _setVar.call(this, 7, day);
      _setVar.call(this, 8, period);

      // 基础衰减：饥饿/口渴
      const randDrop = () => Math.floor(5 + Math.random() * 7); // 5~11
      this.setValue(1, Math.max(0, this.value(1) - randDrop())); // 饥饿
      this.setValue(2, Math.max(0, this.value(2) - randDrop())); // 口渴

      // 联动衰减
      const v = this;
      const hunger = v.value(1);
      const thirst = v.value(2);
      const mood = v.value(3);

      let moodDrop = 0;
      let healthDrop = 0;

      if (hunger < 50) {
        moodDrop += Math.floor(2 + Math.random() * 3);
        healthDrop += Math.floor(1 + Math.random() * 2);
      }
      if (thirst < 50) {
        moodDrop += Math.floor(2 + Math.random() * 3);
        healthDrop += Math.floor(1 + Math.random() * 2);
      }

      if (hunger < 20) {
        moodDrop += Math.floor(2 + Math.random() * 2);
        healthDrop += Math.floor(3 + Math.random() * 3);
      }
      if (thirst < 20) {
        moodDrop += Math.floor(2 + Math.random() * 2);
        healthDrop += Math.floor(3 + Math.random() * 3);
      }

      if (mood < 50) {
        healthDrop += Math.floor(1 + Math.random() * 2);
      }
      if (mood < 20) {
        healthDrop += Math.floor(2 + Math.random() * 3);
      }

      v.setValue(3, Math.max(0, v.value(3) - moodDrop));
      v.setValue(4, Math.max(0, v.value(4) - healthDrop));

      //=== 时间提示与色调变化 ===//
      const periodText = getPeriodText(period);
      const fullText = `${year}年${month}月${day}日 ${periodText}`;
      $gameMessage.add(`时间流逝，现在是 ${fullText}。`);

      const toneMap = {
        0: [-40, -40, 0, 48],  // 上午
        1: [30, 20, 0, 0],     // 中午
        2: [-20, -10, -10, 32],// 下午
        3: [-60, -30, 0, 64]   // 晚上
      };
      const tone = toneMap[period] || [0, 0, 0, 0];
      $gameScreen.startTint(tone, 60);

    } else {
      _setVar.call(this, id, value);

      // 检查健康值归零，触发死亡公共事件0004
      if (id === 4 && value <= 0) {
        $gameTemp.reserveCommonEvent(4);
      }
    }
  };

  //=== 菜单场景 ===//
  Scene_Menu.prototype.create = function () {
    Scene_MenuBase.prototype.create.call(this);
    const cmdW = 240, statusW = Graphics.boxWidth - cmdW;
    const cmd = new Window_CommandCustom(0, 0, cmdW);

    const handlers = {
      item: () => SceneManager.push(Scene_Item),
      save: () => SceneManager.push(Scene_Save),
      load: () => SceneManager.push(Scene_Load),
      exit: () => SceneManager.exit(),
      cancel: () => this.popScene()
    };

    Object.keys(handlers).forEach(tag =>
      cmd.setHandler(tag, handlers[tag].bind(this))
    );

    this.addWindow(this._commandWindow = cmd);
    this.addWindow(this._statusWindow = new Window_StatusCustom(cmdW, 0, statusW, Graphics.boxHeight));
  };

  //=== 状态窗口 ===//
  function Window_StatusCustom() { this.initialize(...arguments); }
  Window_StatusCustom.prototype = Object.create(Window_Selectable.prototype);
  Object.assign(Window_StatusCustom.prototype, {
    constructor: Window_StatusCustom,
    initialize(x, y, w, h) { Window_Selectable.prototype.initialize.call(this, x, y, w, h); this.refresh(); this.deactivate(); },
    lineHeight() { return 36; },
    refresh() {
      const c = this.contents; c.clear();
      const v = $gameVariables, x = 20, barW = 200, bh = 12, lh = this.lineHeight(), gap = lh + bh + 10;
      const data = [
        ["饥饿度", v.value(1), ["吃得很饱", "勉强不饿", "很饿了", "极度饥饿"]],
        ["口渴值", v.value(2), ["喝得很足", "有点渴", "很口渴", "非常口渴"]],
        ["心情值", v.value(3), ["心情愉快", "心情略差", "玉玉症", "想重开了"]],
        ["健康值", v.value(4), ["身体健康", "有点疲惫", "生病了", "快要死了"]]
      ];
      data.forEach(([label, val, desc], i) => {
        const y = 20 + i * gap;
        this.drawText(`${label}：${val}（${getText(val, desc)}）`, x, y, 400);
        c.fillRect(x, y + lh, barW, bh, "#444");
        c.fillRect(x, y + lh, barW * val / 100, bh, getColor(val));
      });
      this.drawText(`日期：${v.value(5)}年${v.value(6)}月${v.value(7)}日`, x, 20 + data.length * gap + 10, 400);
    }
  });

  //=== 命令窗口 ===//
  function Window_CommandCustom() { this.initialize(...arguments); }
  Window_CommandCustom.prototype = Object.create(Window_Command.prototype);
  Object.assign(Window_CommandCustom.prototype, {
    constructor: Window_CommandCustom,
    initialize(x, y, w) { this._w = w; Window_Command.prototype.initialize.call(this, x, y); },
    windowWidth() { return this._w; },
    makeCommandList() {
      this.addCommand("查看物品", "item");
      this.addCommand("保存游戏", "save");
      this.addCommand("读取游戏", "load");
      this.addCommand("退出游戏", "exit");
      this.addCommand("返回", "cancel");
    }
  });

  //=== HUD浮窗提示 ===//
  function Window_HintHUD() { this.initialize(...arguments); }
  Window_HintHUD.prototype = Object.create(Window_Base.prototype);
  Object.assign(Window_HintHUD.prototype, {
    constructor: Window_HintHUD,
    initialize(x, y) {
      Window_Base.prototype.initialize.call(this, x, y, 320, this.fittingHeight(6));
      this.opacity = 0; this._last = []; this.refresh();
    },
    update() { Window_Base.prototype.update.call(this); this.check(); },
    check() {
      const v = $gameVariables, msg = [
        `日期：${v.value(5)}年${v.value(6)}月${v.value(7)}日 ${getPeriodText(v.value(8))}`,
        `金钱：${$gameVariables.value(18)} 元`
      ];
      [[1,"饥饿",["吃得很饱","勉强不饿","有点饿","非常饥饿"]],
       [2,"口渴",["喝得很足","有点渴","很口渴","非常口渴"]],
       [3,"心情",["心情愉快","心情略差","玉玉症","想重开了"]],
       [4,"健康",["身体健康","有点疲惫","生病了","快要死了"]]
      ].forEach(([id,label,desc]) => {
        const val = v.value(id);
        msg.push({ label, value: val, text: getText(val, desc) });
      });
      if (JSON.stringify(msg) !== JSON.stringify(this._last)) {
        this._last = msg;
        this.refresh();
      }
    },
    refresh() {
      const c = this.contents; c.clear();
      let y = 0;
      this._last.forEach(line => {
        if (typeof line === "string") this.resetTextColor(), this.drawText(line, 0, y, this.contentsWidth(), "right");
        else this.changeTextColor(getColor(line.value)), this.drawText(`${line.label}：${line.text}`, 0, y, this.contentsWidth(), "right");
        y += this.lineHeight();
      });
      this._last.length ? this.open() : this.close();
    }
  });

  const _createAll = Scene_Map.prototype.createAllWindows;
  Scene_Map.prototype.createAllWindows = function () {
    _createAll.call(this);
    this.addWindow(this._sanheHintWindow = new Window_HintHUD(Graphics.boxWidth - 320, 0));
  };

  //=== 修改物品分类 ===//
  Window_ItemCategory.prototype.makeCommandList = function () {
    this.addCommand("道具", 'item');
    this.addCommand("重要物品", 'keyItem');
  };

//=== 使用变量18作为金钱系统 ===//

// 替换 gold()，返回变量18的值
Game_Party.prototype.gold = function() {
  return $gameVariables.value(18) || 0;
};

// 替换 gainGold，正负都支持
Game_Party.prototype.gainGold = function(amount) {
  const current = $gameVariables.value(18) || 0;
  const result = Math.max(0, current + amount);
  $gameVariables.setValue(18, result);
};

// 替换 loseGold（不是必须，但保险）
Game_Party.prototype.loseGold = function(amount) {
  this.gainGold(-amount);
};

})();
