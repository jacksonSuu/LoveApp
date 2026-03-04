import { motion } from 'framer-motion'

type AnimatedModalProps = {
    onClose: () => void
    children: React.ReactNode
}

export function AnimatedModal({ onClose, children }: AnimatedModalProps) {
    return (
        <motion.div
            className="modal"
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.target === e.currentTarget && onClose()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div className="modal-card" initial={{ y: 24, scale: 0.97, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 14, scale: 0.98, opacity: 0 }}>
                {children}
            </motion.div>
        </motion.div>
    )
}
