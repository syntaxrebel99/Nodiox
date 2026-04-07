"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { routing, usePathname, useRouter } from "@nodiox/i18n"
import { useTheme } from "next-themes"
import { Settings, Moon, Sun, Monitor, Check, Languages, Palette } from "lucide-react"
import { SA, FR, US } from "country-flag-icons/react/3x2"
import { useParams } from "next/navigation"

import { Button, buttonVariants } from "./ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { cn } from "@nodiox/utils"

export function AppSettings() {
    const t = useTranslations("Auth")
    const { setTheme, theme } = useTheme()
    const locale = useLocale()
    const router = useRouter()
    const pathname = usePathname()
    const params = useParams()

    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        setMounted(true)
    }, [])

    function onLanguageChange(nextLocale: string) {
        router.replace(
            // @ts-expect-error -- pathname is compatible
            { pathname, params },
            { locale: nextLocale as (typeof routing.locales)[number] }
        )
    }

    const Flags: Record<string, React.ElementType> = {
        ar: SA,
        fr: FR,
        en: US,
    }

    const orderedLocales = ["en", "fr", "ar"] as const

    if (!mounted) {
        return (
            <div className="absolute bottom-6 right-6 z-50 rtl:right-auto rtl:left-6">
                <Button variant="outline" size="icon" className="rounded-full shadow-md bg-background" disabled aria-label={t("appSettings")}>
                    <Settings className="size-4" />
                    <span className="sr-only">{t("appSettings")}</span>
                </Button>
            </div>
        )
    }

    return (
        <div className="absolute bottom-6 right-6 z-50 rtl:right-auto rtl:left-6">
            <DropdownMenu>
                <DropdownMenuTrigger 
                    className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full shadow-md bg-background hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors select-none outline-none")}
                    aria-label={t("appSettings")}
                >
                    <Settings className="size-4" />
                    <span className="sr-only">{t("appSettings")}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 mb-2">

                    {/* Theme Section */}
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer w-full">
                            <Palette className="size-4 shrink-0" />
                            <span>{t("appearance")}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent aria-label={t("appearance")}>
                                <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer flex items-center justify-between w-full min-w-[140px]">
                                    <div className="flex items-center gap-2">
                                        <Sun className="size-4 shrink-0" />
                                        <span>{t("light")}</span>
                                    </div>
                                    {theme === "light" && <Check className="size-4" />}
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Moon className="size-4 shrink-0" />
                                        <span>{t("dark")}</span>
                                    </div>
                                    {theme === "dark" && <Check className="size-4" />}
                                </DropdownMenuItem>

                                <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Monitor className="size-4 shrink-0" />
                                        <span>{t("system")}</span>
                                    </div>
                                    {theme === "system" && <Check className="size-4" />}
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Language Section */}
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer w-full">
                            <Languages className="size-4 shrink-0" />
                            <span>{t("language")}</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent aria-label={t("language")}>
                                {orderedLocales.map((cur) => {
                                    const Flag = Flags[cur]
                                    return (routing.locales as readonly string[]).includes(cur) ? (
                                        <DropdownMenuItem
                                            key={cur}
                                            onClick={() => onLanguageChange(cur)}
                                            className={cn(
                                                "flex items-center justify-between w-full gap-3 cursor-pointer py-2 min-w-[140px]",
                                                locale === cur ? "bg-accent" : ""
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                {Flag && <Flag className="w-[23px] h-[15px] shrink-0 rounded-[3px] shadow-sm" style={{ minWidth: 23, minHeight: 15 }} />}
                                                <span className={cn(
                                                    locale === cur && "font-medium",
                                                    cur === 'ar' && "font-arabic pt-1" // minor bump for arabic font
                                                )}>
                                                    {t(`lang_${cur}`)}
                                                </span>
                                            </div>
                                            {locale === cur && <Check className="size-4" />}
                                        </DropdownMenuItem>
                                    ) : null
                                })}
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>

                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
