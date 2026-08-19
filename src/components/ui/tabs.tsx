'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import styles from './tabs.module.css'

export type Tab = {
  title: string
  value: string
  content?: React.ReactNode
}

export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.value ?? '')

  const current = tabs.find((t) => t.value === active) ?? tabs[0]

  return (
    <div className={styles.root}>
      <div className={styles.list} role="tablist" aria-label="Módulos">
        {tabs.map((tab) => {
          const isActive = tab.value === active
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => setActive(tab.value)}
            >
              {isActive && (
                <motion.span
                  layoutId="landing-tab-pill"
                  className={styles.pill}
                  transition={{ type: 'spring', bounce: 0.25, duration: 0.45 }}
                />
              )}
              <span className={styles.tabLabel}>{tab.title}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.panel} role="tabpanel">
        {current?.content}
      </div>
    </div>
  )
}
