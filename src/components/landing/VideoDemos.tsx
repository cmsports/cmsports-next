'use client'

import styles from './VideoDemos.module.css'

const VIDEOS = [
  {
    src: '/videos/demo-cmsports-1.mp4',
    title: 'Operación del club',
    caption: 'Así se ve el día a día en CMsports.',
  },
  {
    src: '/videos/demo-cmsports-2.mp4',
    title: 'Plataforma en acción',
    caption: 'Plantel, cobros, asistencia y más en un solo lugar.',
  },
]

export default function VideoDemos() {
  return (
    <div className={styles.grid}>
      {VIDEOS.map((video) => (
        <figure key={video.src} className={styles.card}>
          <div className={styles.frame}>
            <video
              className={styles.video}
              src={video.src}
              controls
              playsInline
              preload="metadata"
              muted
            />
          </div>
          <figcaption>
            <p className={styles.title}>{video.title}</p>
            <p className={styles.caption}>{video.caption}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
