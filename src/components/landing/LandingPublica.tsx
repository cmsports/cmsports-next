'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'motion/react'
import {
  Menu,
  X,
  ArrowRight,
  Layers,
  Shield,
  Wallet,
  Smartphone,
  AppWindow,
  CreditCard,
  Sparkles,
  Wrench,
  Headset,
  Mail,
  CheckCircle2,
} from 'lucide-react'
import styles from './landing.module.css'
import { CardBody, CardContainer, CardItem } from '@/components/ui/3d-card'
import LandingModulesTabs from './LandingModulesTabs'
import AntesDespues from './AntesDespues'
import VideoDemos from './VideoDemos'

const NAV = [
  { href: '#que-es', label: 'Qué es' },
  { href: '#demo', label: 'Demo' },
  { href: '#modulos', label: 'Módulos' },
  { href: '#resultados', label: 'Resultados' },
  { href: '#equipo', label: 'Equipo' },
  { href: '#contacto', label: 'Contacto' },
]

const BENEFICIOS = [
  {
    title: 'Unifica la operación',
    text: 'Plantel, asistencia, cobros y torneos en una sola fuente de verdad.',
    icon: Layers,
  },
  {
    title: 'Roles claros',
    text: 'Admin, profesor y jugador ven solo lo que les corresponde.',
    icon: Shield,
  },
  {
    title: 'Finanzas con rastro',
    text: 'Mensualidades, mora e ingresos sin depender del WhatsApp.',
    icon: Wallet,
  },
  {
    title: 'Acceso web',
    text: 'Celular, tablet o PC. Sin instalar nada.',
    icon: Smartphone,
  },
]

const IMPLEMENTACION = [
  { n: '01', t: 'Reunión de inicio', d: 'Levantamos datos del club, módulos y responsables.' },
  { n: '02', t: 'Configuración', d: 'Espacio del club, usuarios, parámetros y accesos.' },
  { n: '03', t: 'Carga de base', d: 'Plantel, bloques, finanzas y estructura operativa.' },
  { n: '04', t: 'Capacitación', d: 'Charlas con administradores (y profesores si el club lo pide).' },
  { n: '05', t: 'Marcha blanca', d: 'Sistema listo, soporte activo y uso diario.' },
]

const RESULTADOS = [
  {
    when: '3 meses',
    title: 'Inicio ordenado',
    items: [
      'Plantel y accesos cargados en la plataforma',
      'Asistencia y cobros operando en el día a día',
      'Equipo capacitado y con roles claros',
    ],
  },
  {
    when: '6 meses',
    title: 'Operación estable',
    items: [
      'Menos planillas y chats para lo operativo',
      'Mora y asistencia visibles, no a ojo',
      'Admin y profesores con la misma información',
    ],
  },
  {
    when: '12 meses',
    title: 'Cultura digital',
    items: [
      'CMsports como fuente de verdad del club',
      'Reportes listos para dirección y socios',
      'Torneos, ranking e historial acumulado',
    ],
  },
]

const FUTUROS = [
  {
    title: 'Apps nativas',
    text: 'Android, iPhone, tablet y PC, con avisos de torneo, mensualidad y ranking. Incluidas, sin cobro adicional.',
    icon: AppWindow,
  },
  {
    title: 'Pagos en línea',
    text: 'Integración Transbank, Mercado Pago u otro, conectada al software. Opcional y cotizable.',
    icon: CreditCard,
  },
  {
    title: 'IA en el sistema',
    text: 'Apoyo inteligente para seguimiento técnico, alertas y decisiones del día a día del club.',
    icon: Sparkles,
  },
  {
    title: 'A medida del club',
    text: 'Sistemas y módulos personalizados según la operación real de cada institución.',
    icon: Wrench,
  },
]

const FUNDADORES = [
  {
    nombre: 'Luis Muñoz',
    rol: 'Cofundador',
    email: 'lmunozs@fen.uchile.cl',
  },
  {
    nombre: 'Benjamín Cárdenas',
    rol: 'Cofundador',
    email: 'bcardenasc@fen.uchile.cl',
  },
]

export default function LandingPublica() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const page = pageRef.current
    const header = headerRef.current
    if (!page || !header) return

    const syncHeaderHeight = () => {
      page.style.setProperty('--landing-header-h', `${header.offsetHeight}px`)
    }

    syncHeaderHeight()
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncHeaderHeight)
      : null
    observer?.observe(header)
    window.addEventListener('resize', syncHeaderHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncHeaderHeight)
    }
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    html.classList.remove('dark')
    return () => {
      try {
        if (localStorage.getItem('theme') === 'dark') html.classList.add('dark')
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  function cerrarMenu() {
    setMenuOpen(false)
  }

  return (
    <div ref={pageRef} className={styles.page} data-landing>
      <header ref={headerRef} className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
        <Link href="/" className={styles.brand} onClick={cerrarMenu}>
          <Image
            src="/logo.png"
            alt="CMsports"
            width={52}
            height={52}
            priority
            className={styles.brandIcon}
          />
          <span className={styles.brandText}>CMsports</span>
        </Link>

        <nav className={styles.nav} aria-label="Principal">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
          <Link href="/login" className={styles.ctaIngresar}>Ingresar</Link>
        </nav>

        <button
          type="button"
          className={styles.menuBtn}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {menuOpen && (
        <div className={`${styles.mobileNav} ${styles.mobileNavOpen}`}>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} onClick={cerrarMenu}>{item.label}</a>
          ))}
          <Link href="/login" className={styles.ctaIngresar} onClick={cerrarMenu}>
            Ingresar
          </Link>
        </div>
      )}

      {/* HERO */}
      <section className={styles.hero} aria-label="Inicio">
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Gestión deportiva profesional</p>
          <p className={styles.heroBrand}>CMsports</p>
          <h1 className={styles.heroTitle}>
            Ordenamos la operación del club para que ustedes se concentren en formar deportistas.
          </h1>
          <p className={styles.heroLede}>
            Plantel, asistencia, finanzas, torneos y reportes en un solo lugar. Hecho en Chile, para clubes de Chile y Latinoamérica.
          </p>
          <div className={styles.heroActions}>
            <Link href="/login" className={styles.btnPrimary}>
              Ingresar al sistema <ArrowRight size={16} />
            </Link>
            <a href="#contacto" className={styles.btnGhost}>Contacto</a>
          </div>
          <p className={styles.heroNote}>
            Asociación TDM Buin y Paine ya opera con CMsports.
          </p>
        </div>
      </section>

      {/* QUÉ ES */}
      <section id="que-es" className={styles.section}>
        <div className={styles.sectionSplit}>
          <div>
            <p className={styles.sectionLabel}>Quiénes somos</p>
            <h2 className={styles.sectionTitle}>Qué es CMsports</h2>
            <hr className={styles.rule} />
            <div className={styles.prose}>
              <p>
                Empresa chilena de tecnología deportiva. Desarrollamos software de gestión para clubes y asociaciones.
              </p>
              <p>
                Digitalizamos lo que hoy vive en planillas, WhatsApp y cuadernos: plantel, asistencia, cobros, torneos y comunicación.
              </p>
              <p className={styles.emphasis}>
                Nos encargamos de la administración, para que el club se concentre en formar deportistas.
              </p>
            </div>
          </div>

          <CardContainer containerClassName={styles.card3dWrap}>
            <CardBody className={styles.card3dBody}>
              <CardItem translateZ={40} className={styles.card3dLabel}>
                Panel del club
              </CardItem>
              <CardItem translateZ={60} className={styles.card3dShot}>
                <Image
                  src="/preview-dashboard-cmsports.png"
                  alt="Vista previa del panel CMsports"
                  width={640}
                  height={400}
                  className={styles.card3dImg}
                />
              </CardItem>
              <CardItem translateZ={50} as="p" className={styles.card3dHint}>
                Pase el cursor sobre la tarjeta
              </CardItem>
            </CardBody>
          </CardContainer>
        </div>
      </section>

      {/* ANTES / DESPUÉS */}
      <section id="cambio" className={styles.sectionAlt}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>El cambio</p>
          <h2 className={styles.sectionTitle}>De la planilla al sistema</h2>
          <p className={styles.sectionIntro}>
            Dejen Excel, chats y cuadernos. Pásen a una sola plataforma para la operación del club.
          </p>
          <AntesDespues />
        </div>
      </section>

      {/* VIDEOS */}
      <section id="demo" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Demo</p>
          <h2 className={styles.sectionTitle}>Vea CMsports en acción</h2>
          <p className={styles.sectionIntro}>
            Dos recorridos cortos de la plataforma. Puede reproducirlos con audio o en silencio.
          </p>
          <VideoDemos />
        </div>
      </section>

      {/* CÓMO AYUDA */}
      <section id="como-ayuda" className={styles.sectionAlt}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Valor</p>
          <h2 className={styles.sectionTitle}>Cómo ayuda al club</h2>
          <p className={styles.sectionIntro}>Una sola fuente de verdad para la operación diaria.</p>
          <div className={styles.benefitGrid}>
            {BENEFICIOS.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.article
                  key={item.title}
                  className={styles.benefitCard}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                >
                  <Icon className={styles.benefitIcon} size={22} />
                  <h3 className={styles.benefitTitle}>{item.title}</h3>
                  <p className={styles.benefitText}>{item.text}</p>
                </motion.article>
              )
            })}
          </div>
        </div>
      </section>

      {/* MÓDULOS */}
      <section id="modulos" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Plataforma</p>
          <h2 className={styles.sectionTitle}>Módulos desde el día uno</h2>
          <p className={styles.sectionIntro}>
            Elija un módulo para ver qué hace. Se activan según la necesidad del club.
          </p>
          <LandingModulesTabs />
        </div>
      </section>

      {/* IMPLEMENTACIÓN */}
      <section id="implementacion" className={styles.sectionAlt}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Implementación</p>
          <h2 className={styles.sectionTitle}>Implementación sencilla</h2>
          <p className={styles.sectionIntro}>
            Un proceso claro, con capacitación y acompañamiento. Sin vueltas innecesarias.
          </p>
          <ol className={styles.implList}>
            {IMPLEMENTACION.map((step, i) => (
              <motion.li
                key={step.n}
                className={styles.implItem}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ delay: i * 0.05 }}
              >
                <span className={styles.implNum}>{step.n}</span>
                <div>
                  <p className={styles.implTitle}>{step.t}</p>
                  <p className={styles.implDesc}>{step.d}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* RESULTADOS 3 / 6 / 12 */}
      <section id="resultados" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Horizonte</p>
          <h2 className={styles.sectionTitle}>Resultados esperados</h2>
          <p className={styles.sectionIntro}>
            Así debería verse un club que adopta CMsports como hábito, no como un sistema aparte.
          </p>
          <div className={styles.timeline}>
            {RESULTADOS.map((block, i) => (
              <motion.article
                key={block.when}
                className={styles.timelineCard}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <p className={styles.timelineWhen}>{block.when}</p>
                <h3 className={styles.timelineTitle}>{block.title}</h3>
                <ul className={styles.timelineList}>
                  {block.items.map((item) => (
                    <li key={item}>
                      <CheckCircle2 size={16} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* FUTURO */}
      <section id="futuro" className={styles.sectionAlt}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Próximos pasos</p>
          <h2 className={styles.sectionTitle}>Servicios adicionales</h2>
          <p className={styles.sectionIntro}>
            Lo que viene y lo que ya podemos cotizar según el club.
          </p>
          <div className={styles.futureGrid}>
            {FUTUROS.map((item) => {
              const Icon = item.icon
              return (
                <motion.article
                  key={item.title}
                  className={styles.futureCard}
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                >
                  <Icon size={22} className={styles.futureIcon} />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </motion.article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ALCANCE + CLIENTES */}
      <section id="alcance" className={styles.section}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Presencia</p>
          <h2 className={styles.sectionTitle}>Chile y Latinoamérica</h2>
          <p className={styles.sectionIntro}>
            Pensado para clubes deportivos de distintas disciplinas. Empezamos en tenis de mesa; la arquitectura permite crecer a más deportes.
          </p>
          <div className={styles.presenceGrid}>
            <article className={styles.presenceCard}>
              <p className={styles.presenceEyebrow}>En producción</p>
              <h3>Asociación TDM Buin y Paine</h3>
              <p>
                Ya utilizan CMsports para la operación diaria: plantel, asistencia, finanzas y más.
              </p>
            </article>
            <article className={styles.presenceCard}>
              <p className={styles.presenceEyebrow}>Soporte</p>
              <h3>Lunes a viernes</h3>
              <p>
                Acompañamiento en horario laboral. Corrección de fallas y canal de dudas cuando el sistema está en marcha.
              </p>
              <p className={styles.supportLine}>
                <Headset size={16} /> Soporte Lun–Vie · horario laboral
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* EQUIPO / MISIÓN */}
      <section id="equipo" className={styles.sectionAlt}>
        <div className={styles.sectionInner}>
          <p className={styles.sectionLabel}>Equipo</p>
          <h2 className={styles.sectionTitle}>Quiénes somos</h2>
          <div className={styles.missionGrid}>
            <article className={styles.missionCard}>
              <h3>Misión</h3>
              <p>
                Digitalizar la gestión de clubes y asociaciones para que la energía vaya a formar deportistas, no a perseguir planillas y chats.
              </p>
            </article>
            <article className={styles.missionCard}>
              <h3>Visión</h3>
              <p>
                Ser la plataforma de referencia para la operación deportiva en Chile y Latinoamérica: modular, confiable y cercana a cada club.
              </p>
            </article>
          </div>

          <div className={styles.founders}>
            {FUNDADORES.map((f) => (
              <article key={f.email} className={styles.founderCard}>
                <p className={styles.founderRole}>{f.rol}</p>
                <h3 className={styles.founderName}>{f.nombre}</h3>
                <a href={`mailto:${f.email}`} className={styles.founderMail}>
                  <Mail size={14} /> {f.email}
                </a>
              </article>
            ))}
          </div>

          <a
            href="https://www.instagram.com/cmsports_chile/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.igLink}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
            </svg>
            @cmsports_chile
          </a>
        </div>
      </section>

      {/* CONTACTO */}
      <section id="contacto" className={styles.contact}>
        <h2 className={styles.contactTitle}>Conversemos sobre su club</h2>
        <p className={styles.contactLede}>
          Si quieren conocer CMsports, evaluar una implementación o un desarrollo a medida, escríbannos.
        </p>
        <a className={styles.contactMail} href="mailto:contacto@cmsportschile.cl">
          contacto@cmsportschile.cl
        </a>
        <div className={styles.contactActions}>
          <Link href="/login" className={styles.btnPrimary}>
            Ingresar al sistema <ArrowRight size={16} />
          </Link>
          <a href="mailto:contacto@cmsportschile.cl" className={styles.btnGhost}>
            Escribirnos
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <span><strong>CMsports</strong> · CMESTUDIOS Limitada</span>
        <span>cmsportschile.cl · @cmsports_chile</span>
      </footer>
    </div>
  )
}
