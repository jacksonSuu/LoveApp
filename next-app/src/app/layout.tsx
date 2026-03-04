import './globals.css'
import type { Metadata } from 'next'
import { GlobalScrollbar } from '../components/GlobalScrollbar'

export const metadata: Metadata = {
    title: '恋爱抽奖机',
    description: '给宝贝的专属抽奖机',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh">
            <body>
                <GlobalScrollbar />
                {children}
            </body>
        </html>
    )
}
