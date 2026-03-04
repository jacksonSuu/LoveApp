export function GlobalScrollbar() {
    return (
        <style
            dangerouslySetInnerHTML={{
                __html: `
                    * {
                        scrollbar-width: thin;
                        scrollbar-color: rgba(255, 255, 255, 0.95) transparent;
                    }

                    *::-webkit-scrollbar {
                        width: 6px;
                        height: 6px;
                    }

                    *::-webkit-scrollbar-track {
                        background: transparent;
                    }

                    *::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.95);
                        border-radius: 999px;
                        border: 1px solid rgba(255, 255, 255, 0.65);
                    }

                    *::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 1);
                    }

                    *::-webkit-scrollbar-corner {
                        background: transparent;
                    }
                `,
            }}
        />
    )
}