"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FullscreenAlbumBg } from "../modules/home/components/FullscreenAlbumBg";
import { LoveTimerCard } from "../modules/home/components/LoveTimerCard";
import { TodayActionCard } from "../modules/home/components/TodayActionCard";
import { getHomeSummary, submitTodayCheckin } from "../modules/home/api";
import type { HomeSummary, TodayCheckinStatus } from "../modules/home/types";

const FALLBACK_HOME_SUMMARY: HomeSummary = {
    loveTimer: null,
    album: [],
    todayCheckinStatus: "pending",
    tagline: "今天也要记得说一句“我爱你” 💗",
};

export default function Page() {
    const [summary, setSummary] = useState<HomeSummary>(FALLBACK_HOME_SUMMARY);
    const [checkinStatus, setCheckinStatus] = useState<TodayCheckinStatus>("pending");
    const [loading, setLoading] = useState(true);
    const [errorText, setErrorText] = useState("");

    useEffect(() => {
        const loadSummary = async () => {
            setLoading(true);
            setErrorText("");
            try {
                const data = await getHomeSummary();
                setSummary(data);
                setCheckinStatus(data.todayCheckinStatus);
            } catch {
                setSummary(FALLBACK_HOME_SUMMARY);
                setCheckinStatus("pending");
                setErrorText("首页数据加载失败，已切换默认展示");
            } finally {
                setLoading(false);
            }
        };

        void loadSummary();
    }, []);

    const helperText = useMemo(() => {
        if (loading) {
            return "首页加载中...";
        }
        if (errorText) {
            return errorText;
        }
        return summary.tagline || "愿你们每一天都值得被纪念";
    }, [errorText, loading, summary.tagline]);

    const handleCheckin = async () => {
        const result = await submitTodayCheckin();
        setCheckinStatus(result.status);
    };

    return (
        <div className="crystal-shell">
            <FullscreenAlbumBg photos={summary.album} />

            <header className="top-bar">
                <div className="brand">🎀 缘</div>
                <div className="top-right">
                    <span className="chance-pill">
                        <span>首页改版 M1</span>
                        <strong>{checkinStatus === "done" ? "已打卡" : "未打卡"}</strong>
                        <small>抽奖模块将迁移为子入口</small>
                    </span>
                </div>
            </header>

            <main className="main-stage">
                <LoveTimerCard anniversaryDate={summary.loveTimer?.anniversaryDate} />
                <TodayActionCard status={checkinStatus} onCheckin={handleCheckin} onCheckedIn={() => setCheckinStatus("done")} />
                <Link href="/lottery" className="btn" style={{ marginTop: 4 }}>
                    进入抽奖子模块
                </Link>
                <p className="home-action-card-helper" style={{ width: "min(560px, 92vw)", margin: "8px auto 0", textAlign: "center" }}>
                    {helperText}
                </p>
            </main>
        </div>
    );
}
