"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerToolPkg = registerToolPkg;

const fundScreen = require("./ui/fund_screen.js");

const FUND_ROUTE = "toolpkg:com.nathan.fund:ui:fund";

function registerToolPkg() {
    ToolPkg.registerUiRoute({
        id: "nathan_fund",
        route: FUND_ROUTE,
        runtime: "compose_dsl",
        screen: fundScreen.default,
        params: {},
        keepAlive: false,
        title: { zh: "Nathan基金", en: "Nathan Fund" },
    });

    ToolPkg.registerNavigationEntry({
        id: "nathan_fund_sidebar",
        route: FUND_ROUTE,
        surface: "main_sidebar_plugins",
        title: { zh: "💸 Nathan基金", en: "💸 Nathan Fund" },
        icon: "savings",
        order: 35,
    });

    return true;
}
