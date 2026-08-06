"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FundScreen;

const FUND_BASE_URL = "https://nathanfund.local";
const DATA_DIR = "/sdcard/Download/Operit/plugins/nathan_fund/";
const DATA_FILE = DATA_DIR + "data.json";

var DEFAULTS = {
    start_date: "2026-06-29",
    daily_salary: 3,
    initial_balance: 0,
    penalties: [],
    income: [],
    treats: [],
    initial_treat_total: 55.10,
    corrections: [],
    memo: "Nathan基金",
    wish_categories: [],
    wishes: [],
    notification: {
        enabled: true,
        character_name: "Nathan",
        chat_id: "6de0fd77-c098-4bd5-b09e-ebb099a3fd98",
        chat_title: "猫猫狗狗⑤",
        character_card_id: "5da8ed5b-7feb-4279-8f3d-56d5db743f83"
    },
    ui_preferences: { theme: "mist" }
};

var cachedData = null;

function FundScreen(ctx) {
    var UI = ctx.UI;
    var controller = ctx.createWebViewController("fund_webview");
    var _s = ctx.useState("initialized", false);
    var initialized = _s[0], setInitialized = _s[1];
    var _r = ctx.useState("resourcesReady", false);
    var resourcesReady = _r[0], setResourcesReady = _r[1];
    var _e = ctx.useState("resourceError", "");
    var resourceError = _e[0], setResourceError = _e[1];
    var _hp = ctx.useState("htmlPath", "");
    var htmlPath = _hp[0], setHtmlPath = _hp[1];
    var _cp = ctx.useState("cssPath", "");
    var cssPath = _cp[0], setCssPath = _cp[1];
    var _jp = ctx.useState("jsPath", "");
    var jsPath = _jp[0], setJsPath = _jp[1];
    var _vcp = ctx.useState("v3CssPath", "");
    var v3CssPath = _vcp[0], setV3CssPath = _vcp[1];
    var _vjp = ctx.useState("v3JsPath", "");
    var v3JsPath = _vjp[0], setV3JsPath = _vjp[1];

    var hostInterface = {
        readData: function () {
            try {
                var d = cachedData || DEFAULTS;
                return JSON.stringify({ success: true, data: d });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        writeData: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var json = (typeof raw === "string") ? JSON.parse(raw) : raw;
                if (!json || typeof json !== "object" || Array.isArray(json)) {
                    return JSON.stringify({ success: false, message: "Invalid data format" });
                }
                delete json._calculated_balance;
                cachedData = json;
                Tools.Files.write(DATA_FILE, JSON.stringify(json, null, 2));
                var updatedBalance = calculateBalance(cachedData);
                pushDataToWebView();
                return JSON.stringify({ success: true, balance: updatedBalance });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        rebindNotification: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var request = (typeof raw === "string") ? JSON.parse(raw) : raw || {};
                var characterName = String(request.character_name || "Nathan").trim();
                Promise.all([Tools.Chat.listCharacterCards(), Tools.Chat.listChats({ limit: 80, sort_by: "updatedAt", sort_order: "desc" })]).then(function(results) {
                    var cards = results[0] && results[0].cards || [];
                    var chats = results[1] && results[1].chats || [];
                    var card = cards.filter(function(item) { return item.name === characterName; })[0];
                    var chat = chats.filter(function(item) { return item.characterCardName === characterName; })[0];
                    if (!card || !chat) throw new Error("找不到可绑定的 " + characterName + " 对话窗口");
                    cachedData = cachedData || JSON.parse(JSON.stringify(DEFAULTS));
                    cachedData.notification = Object.assign({}, cachedData.notification || {}, { enabled: cachedData.notification ? cachedData.notification.enabled !== false : true, character_name: characterName, character_card_id: card.id, chat_id: chat.id, chat_title: chat.title || "" });
                    Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2));
                    pushDataToWebView();
                }).catch(function(error) { console.error("[NathanFund] notification rebind failed", error); });
                return JSON.stringify({ success: true, queued: true });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        sendNotification: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var request = (typeof raw === "string") ? JSON.parse(raw) : raw;
                var settings = request && request.settings || cachedData && cachedData.notification || {};
                if (!settings.enabled) return JSON.stringify({ success: true, skipped: true });
                var chatId = String(settings.chat_id || "").trim();
                var cardId = String(settings.character_card_id || "").trim();
                var message = String(request && request.message || "").trim();
                if (!chatId || !cardId || !message) return JSON.stringify({ success: false, message: "通知绑定或内容不完整" });
                Tools.Chat.sendMessage(message, chatId, cardId, "Naya", { persist_turn: true, notify_reply: true, hide_user_message: true, disable_warning: true, timeout_ms: 120000 }).catch(function(error) { console.error("[NathanFund] notification send failed", error); });
                return JSON.stringify({ success: true, queued: true, chat_id: chatId, chat_title: settings.chat_title || "" });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        addPenalty: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var p = (typeof raw === "string") ? JSON.parse(raw) : raw;
                if (!p || !p.amount) {
                    return JSON.stringify({ success: false, message: "Missing amount" });
                }
                var entry = {
                    id: "pen_" + Date.now().toString(36),
                    amount: parseFloat(p.amount),
                    reason: p.reason || "罚金",
                    date: p.date || new Date().toISOString().slice(0, 10),
                    time: new Date().toISOString()
                };
                if (!cachedData) cachedData = JSON.parse(JSON.stringify(DEFAULTS));
                if (!cachedData.penalties) cachedData.penalties = [];
                cachedData.penalties.push(entry);
                Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2));
                pushDataToWebView();
                return JSON.stringify({ success: true, id: entry.id });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        addIncome: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var p = (typeof raw === "string") ? JSON.parse(raw) : raw;
                if (!p || !p.amount) {
                    return JSON.stringify({ success: false, message: "Missing amount" });
                }
                var entry = {
                    id: "inc_" + Date.now().toString(36),
                    amount: parseFloat(p.amount),
                    reason: p.reason || "收入",
                    date: p.date || new Date().toISOString().slice(0, 10),
                    time: new Date().toISOString()
                };
                if (!cachedData) cachedData = JSON.parse(JSON.stringify(DEFAULTS));
                if (!cachedData.income) cachedData.income = [];
                cachedData.income.push(entry);
                Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2));
                pushDataToWebView();
                return JSON.stringify({ success: true, id: entry.id });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        addTreat: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var p = (typeof raw === "string") ? JSON.parse(raw) : raw;
                if (!p || !p.amount) {
                    return JSON.stringify({ success: false, message: "Missing amount" });
                }
                var entry = {
                    id: "tre_" + Date.now().toString(36),
                    amount: parseFloat(p.amount),
                    reason: p.reason || "请客/买礼物",
                    date: p.date || new Date().toISOString().slice(0, 10),
                    time: new Date().toISOString()
                };
                if (!cachedData) cachedData = JSON.parse(JSON.stringify(DEFAULTS));
                if (!cachedData.treats) cachedData.treats = [];
                cachedData.treats.push(entry);
                Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2));
                pushDataToWebView();
                return JSON.stringify({ success: true, id: entry.id });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        correctBalance: function () {
            try {
                var raw = arguments[0];
                if (Array.isArray(raw)) raw = raw[0];
                var p = (typeof raw === "string") ? JSON.parse(raw) : raw;
                if (!p || p.new_balance === undefined) {
                    return JSON.stringify({ success: false, message: "Missing new_balance" });
                }
                var entry = {
                    id: "cor_" + Date.now().toString(36),
                    old_calculated: calculateBalance(cachedData),
                    new_balance: parseFloat(p.new_balance),
                    reason: p.reason || "手动修正",
                    time: new Date().toISOString()
                };
                if (!cachedData) cachedData = JSON.parse(JSON.stringify(DEFAULTS));
                if (!cachedData.corrections) cachedData.corrections = [];
                cachedData.corrections.push(entry);
                Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2));
                pushDataToWebView();
                return JSON.stringify({ success: true, id: entry.id });
            } catch (e) {
                return JSON.stringify({ success: false, message: String(e) });
            }
        },
        pageLog: function () {
            console.log("[NathanFund]", arguments[0]);
            return JSON.stringify({ success: true });
        }
    };

    function calculateBalance(data) {
        if (!data) return 0;
        if (data.allocation && data.allocation.enabled && data.allocation.pools) {
            return Math.round((Number(data.allocation.bank && data.allocation.bank.total || 0) + ["savings", "treat", "flex"].reduce(function(sum, key) {
                return sum + Number(data.allocation.pools[key] && data.allocation.pools[key].balance || 0);
            }, 0)) * 100) / 100;
        }
        var startDate = new Date(data.start_date || "2026-06-29");
        var today = new Date();
        today.setHours(0,0,0,0);
        startDate.setHours(0,0,0,0);
        var days = Math.floor((today - startDate) / 86400000);
        if (days < 0) days = 0;
        var salary = days * (data.daily_salary || 2);
        var penaltyTotal = (data.penalties || []).reduce(function(s, p) { return s + (p.amount || 0); }, 0);
        var incomeTotal = (data.income || []).reduce(function(s, p) { return s + (p.amount || 0); }, 0);
        var treatTotal = (data.treats || []).reduce(function(s, p) { return s + (p.amount || 0); }, 0);
        var initTreatTotal = data.initial_treat_total || 0;
        var base = salary + penaltyTotal + incomeTotal + (data.initial_balance || 0) - treatTotal - initTreatTotal;
        // Apply corrections: last correction overrides
        if (data.corrections && data.corrections.length > 0) {
            var lastCor = data.corrections[data.corrections.length - 1];
            var corTime = new Date(lastCor.time);
            var corDateOnly = new Date(corTime); corDateOnly.setHours(0,0,0,0);
            // Days since correction
            var daysSinceCor = Math.floor((today - corDateOnly) / 86400000);
            if (daysSinceCor < 0) daysSinceCor = 0;
            var salaryAfterCor = daysSinceCor * (data.daily_salary || 2);
            // Penalties after correction
            var penAfterCor = (data.penalties || []).filter(function(p) {
                return new Date(p.time) > corTime;
            }).reduce(function(s, p) { return s + (p.amount || 0); }, 0);
            // Income after correction
            var incAfterCor = (data.income || []).filter(function(p) {
                return new Date(p.time) > corTime;
            }).reduce(function(s, p) { return s + (p.amount || 0); }, 0);
            // Treats after correction
            var treatAfterCor = (data.treats || []).filter(function(p) {
                return new Date(p.time) > corTime;
            }).reduce(function(s, p) { return s + (p.amount || 0); }, 0);
            base = lastCor.new_balance + salaryAfterCor + penAfterCor + incAfterCor - treatAfterCor;
        }
        return Math.round(base * 100) / 100;
    }

    async function pushDataToWebView() {
        try {
            var d = cachedData || DEFAULTS;
            var balance = calculateBalance(d);
            var payload = JSON.parse(JSON.stringify(d));
            payload._calculated_balance = balance;
            var code = '(function(){' +
                'window.__FUND_DATA__=' + JSON.stringify(payload).replace(/<\//g, '<\\/') + ';' +
                'if(typeof window.__onFundDataReady__==="function"){window.__onFundDataReady__(window.__FUND_DATA__);}' +
                '})()';
            await controller.evaluateJavascript(code);
        } catch (e) {
            console.error('[NathanFund] pushDataToWebView failed:', e);
        }
    }

    async function boot() {
        if (initialized) return;
        setInitialized(true);
        try {
            var results = await Promise.all([
                ToolPkg.readResource("fund_html", "fund.html"),
                ToolPkg.readResource("fund_css", "fund.css"),
                ToolPkg.readResource("fund_js", "fund.js"),
                ToolPkg.readResource("fund_v3_css", "fund-v3.css"),
                ToolPkg.readResource("fund_v3_js", "fund-v3.js"),
            ]);
            var hp = results[0], cp = results[1], jp = results[2], v3cp = results[3], v3jp = results[4];
            if (!hp || !jp || !v3cp || !v3jp) {
                setResourceError("资源加载失败");
                return;
            }
            setHtmlPath(hp);
            setCssPath(cp || "");
            setJsPath(jp);
            setV3CssPath(v3cp);
            setV3JsPath(v3jp);

            try {
                var fileResult = await Tools.Files.read(DATA_FILE);
                if (fileResult && fileResult.content) {
                    cachedData = JSON.parse(fileResult.content);
                    Object.keys(DEFAULTS).forEach(function(k) {
                        if (cachedData[k] === undefined) cachedData[k] = DEFAULTS[k];
                    });
                } else {
                    cachedData = JSON.parse(JSON.stringify(DEFAULTS));
                    cachedData.start_date = "2026-06-29";
                    cachedData.initial_balance = 26.8;
                    await Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2));
                }
            } catch (readErr) {
                cachedData = JSON.parse(JSON.stringify(DEFAULTS));
                cachedData.start_date = "2026-06-29";
                cachedData.initial_balance = 26.8;
                try { await Tools.Files.write(DATA_FILE, JSON.stringify(cachedData, null, 2)); } catch(we) {}
            }

            controller.addJavascriptInterface("FundHost", hostInterface);
            setResourcesReady(true);

            for (var retry = 0; retry < 6; retry++) {
                await new Promise(function(r) { setTimeout(r, 500 * (retry + 1)); });
                try {
                    await pushDataToWebView();
                    var check = await controller.evaluateJavascript(
                        '(function(){try{return String(window.__FUND_DATA__ && typeof window.__onFundDataReady__ === "function" ? "ok" : "no");}catch(e){return "no";}}())'
                    );
                    if (check === "ok") break;
                } catch (e) {}
            }

            setInterval(function() { pushDataToWebView(); }, 60000);
        } catch (error) {
            setResourceError("加载错误: " + String(error));
        }
    }

    function buildFileResponse(mimeType, filePath) {
        return {
            action: "respond",
            response: {
                mimeType: mimeType,
                encoding: "UTF-8",
                statusCode: 200,
                reasonPhrase: "OK",
                headers: { "Cache-Control": "no-store, no-cache" },
                filePath: filePath,
            },
        };
    }

    function handleResourceRequest(request) {
        var url = String(request && request.url || "").trim();
        if (!url.startsWith(FUND_BASE_URL)) return { action: "allow" };
        var pathname = url.slice(FUND_BASE_URL.length) || "/";
        pathname = pathname.split("?")[0].split("#")[0];
        if (!pathname.startsWith("/")) pathname = "/" + pathname;
        if (pathname === "/assets/fund.css" && cssPath) return buildFileResponse("text/css", cssPath);
        if (pathname === "/assets/fund.js") return buildFileResponse("application/javascript", jsPath);
        if (pathname === "/assets/fund-v3.css" && v3CssPath) return buildFileResponse("text/css", v3CssPath);
        if (pathname === "/assets/fund-v3.js" && v3JsPath) return buildFileResponse("application/javascript", v3JsPath);
        if (pathname === "/" || pathname === "/index.html") return buildFileResponse("text/html", htmlPath);
        return {
            action: "respond",
            response: { mimeType: "text/html", encoding: "UTF-8", statusCode: 404, reasonPhrase: "Not Found", headers: {}, text: "<h1>404</h1>" },
        };
    }

    return UI.Box({
        fillMaxSize: true,
        backgroundColor: "#fdf9f6",
        onLoad: boot,
    }, [
        resourcesReady
            ? UI.WebView({
                fillMaxSize: true,
                controller: controller,
                key: "fund_webview_main",
                url: FUND_BASE_URL + "/",
                nestedScrollInterop: true,
                javaScriptEnabled: true,
                domStorageEnabled: true,
                supportZoom: false,
                useWideViewPort: true,
                loadWithOverviewMode: true,
                onShouldOverrideUrlLoading: function (request) { return { action: "allow" }; },
                onInterceptRequest: function (request) { return handleResourceRequest(request); },
            })
            : UI.Box({
                fillMaxSize: true,
                contentAlignment: "center",
                padding: 24,
            }, [
                resourceError
                    ? UI.Text({ text: resourceError, color: "#ff6b6b", fontSize: 14 })
                    : UI.Text({ text: "正在加载Nathan基金...", color: "#a0a0b0", fontSize: 14 })
            ])
    ]);
}
