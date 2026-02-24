// app/(app)/_components/image_editor/addConsts.ts
import type { OverlayRectItem, OverlayTextItem } from "@/features/editor/editor.types";

/**
 * Генерация ID (на случай если где-то crypto недоступен)
 */
function genId() {
    // browser crypto
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    // fallback
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}


/**
 * Default Text factory
 * Важно: я заполнил поля, которые у тебя уже явно используются в UI.
 * Если в OverlayTextItem есть дополнительные обязательные поля — добавь их сюда один раз,
 * и дальше page.tsx больше не трогаем.
 */
export function makeDefaultText(
    idx: number,
    overrides: Partial<OverlayTextItem> = {}
): OverlayTextItem {
    const base: OverlayTextItem = {
        id: genId(),
        name: `Text ${idx}`,
        text: `Text ${idx}`,

        alwaysOnTop: false,

        color: "#000000",
        fontFamily: "Inter",
        fontSize: 95,
        fontWeight: 400,
        fontStyle: "normal",

        align: "middle-center",
        textAlign: "left",
        lineHeight: 1.2,
        textOpacity: 1,

        plaqueWidth: 0,
        plaqueColor: "#ffffff",
        plaqueOpacity: 0,

        plaqueBorderColor: "#000000",
        plaqueBorderOpacity: 1,
        plaqueBorderWidth: 0,

        borderRadius: 0,

        paddingTop: 10,
        paddingRight: 16,
        paddingBottom: 10,
        paddingLeft: 16,

        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,

        shadowColor: "#000000",
        shadowOpacity: 0,
        shadowBlur: 10,
        shadowOffsetX: 6,
        shadowOffsetY: 6,

        rotationDeg: 0,
    };

    return { ...base, ...overrides };
}


/**
 * Default Rect factory
 */
export function makeDefaultRect(idx: number, overrides: Partial<OverlayRectItem> = {}): OverlayRectItem {
    const base: OverlayRectItem = {
        id: genId(),
        name: `Rectangle ${idx}`,
        width: 500,
        height: 300,
        opacity: 1,

        align: "middle-center",
        marginTop: 0,
        marginRight: 0,
        marginBottom: 0,
        marginLeft: 0,

        rotationDeg: 0,


        fill: {
            kind: "solid",
            color: "#0000ff"
        },

        borderColor: "#000000",
        borderWidth: 0,
        borderRadius: 0,

        alwaysOnTop: false,
    };

    // overrides могут перезаписать всё, включая fill
    return { ...base, ...overrides };
}

