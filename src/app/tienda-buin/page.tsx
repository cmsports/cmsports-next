'use client'

import { useState } from 'react'
import Image from 'next/image'
import AppLayout from '@/app/layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'

/*
  Imágenes → poner en /public/tienda-buin/ con estos nombres:
  p01.jpg  LOKI KIRIN / LOKI K1 CLASICOS Y LAPICEROS
  p02.jpg  BOER LION - LAPICERO
  p03.jpg  ANDRO SUPER CORE OFF-
  p04.jpg  ANDRO SUPER CORE OFF
  p05.jpg  ANDRO RASANT POWERSPONGE
  p06.jpg  ANDRO GOOD!
  p07.jpg  PORO YINHE NEPTUNE OX Y 1.5
  p08.jpg  ANDRO CHAOS
  p09.jpg  GOMA YINHE MERCURY
  p10.jpg  LSZ I
  p11.jpg  LOKI RXTON
  p12.jpg  DOUBLE FISH ATHLON
  p13.jpg  ANDRO RASANTER R50
  p14.jpg  ANDRO RASANTER R45
  p15.jpg  ACELERADOR PARA GOMA HAIFU
  p16.jpg  LIMPIADOR DE GOMAS
  p17.jpg  PEGAMENTO XUSHAOFA
  p18.jpg  MICA PROTECTORA DHS SIN ADHESIVO
*/

const WA = '56968342721'

type Producto = {
  id: number
  nombre: string
  precio: number
  precioSufijo?: string
  cat: 'Maderos' | 'Gomas' | 'Accesorios'
  img: string
}

const productos: Producto[] = [
  { id: 1,  nombre: 'LOKI KIRIN / LOKI K1\nCLASICOS Y LAPICEROS', precio: 10000, cat: 'Maderos',    img: '/tienda-buin/p01.jpg' },
  { id: 2,  nombre: 'BOER LION - LAPICERO',                        precio: 10000, cat: 'Maderos',    img: '/tienda-buin/p02.jpg' },
  { id: 3,  nombre: 'ANDRO SUPER CORE OFF-',                       precio: 30000, cat: 'Maderos',    img: '/tienda-buin/p03.jpg' },
  { id: 4,  nombre: 'ANDRO SUPER CORE OFF',                        precio: 35000, cat: 'Maderos',    img: '/tienda-buin/p04.jpg' },
  { id: 5,  nombre: 'ANDRO RASANT POWERSPONGE',                    precio: 25000, cat: 'Gomas',      img: '/tienda-buin/p05.jpg' },
  { id: 6,  nombre: 'ANDRO GOOD!',                                  precio: 25000, cat: 'Gomas',      img: '/tienda-buin/p06.jpg' },
  { id: 7,  nombre: 'PORO YINHE NEPTUNE OX Y 1.5',                 precio: 5000,  cat: 'Gomas',      img: '/tienda-buin/p07.jpg' },
  { id: 8,  nombre: 'ANDRO CHAOS',                                  precio: 15000, cat: 'Gomas',      img: '/tienda-buin/p08.jpg' },
  { id: 9,  nombre: 'GOMA YINHE MERCURY',                          precio: 10000, cat: 'Gomas',      img: '/tienda-buin/p09.jpg' },
  { id: 10, nombre: 'LSZ I',                                        precio: 10000, cat: 'Gomas',      img: '/tienda-buin/p10.jpg' },
  { id: 11, nombre: 'LOKI RXTON',                                   precio: 15000, cat: 'Gomas',      img: '/tienda-buin/p11.jpg' },
  { id: 12, nombre: 'DOUBLE FISH ATHLON',                           precio: 15000, cat: 'Gomas',      img: '/tienda-buin/p12.jpg' },
  { id: 13, nombre: 'ANDRO RASANTER R50',                           precio: 30000, cat: 'Gomas',      img: '/tienda-buin/p13.jpg' },
  { id: 14, nombre: 'ANDRO RASANTER R45',                           precio: 45000, cat: 'Gomas',      img: '/tienda-buin/p14.jpg' },
  { id: 15, nombre: 'ACELERADOR PARA GOMA HAIFU',                   precio: 10000, cat: 'Accesorios', img: '/tienda-buin/p15.jpg' },
  { id: 16, nombre: 'LIMPIADOR DE GOMAS',                           precio: 7000,  cat: 'Accesorios', img: '/tienda-buin/p16.jpg' },
  { id: 17, nombre: 'PEGAMENTO XUSHAOFA',                           precio: 4000,  cat: 'Accesorios', img: '/tienda-buin/p17.jpg' },
  { id: 18, nombre: 'MICA PROTECTORA DHS SIN ADHESIVO',             precio: 1500,  cat: 'Accesorios', precioSufijo: 'C/U', img: '/tienda-buin/p18.jpg' },
]

const cats = ['Todos', 'Maderos', 'Gomas', 'Accesorios'] as const

function formatPrecio(n: number) {
  return '$' + n.toLocaleString('es-CL')
}

export default function TiendaBuinPage() {
  const { perfil } = usePerfil()
  const [filtro, setFiltro] = useState<string>('Todos')
  const [imgError, setImgError] = useState<Set<number>>(new Set())

  const filtrados = filtro === 'Todos' ? productos : productos.filter(p => p.cat === filtro)

  function mensajeWA(p: Producto) {
    const precio = formatPrecio(p.precio) + (p.precioSufijo ? ` ${p.precioSufijo}` : '')
    return `Hola Rodrigo! Quiero consultar disponibilidad de: ${p.nombre.replace('\n', ' ')} — ${precio}`
  }

  if (!perfil) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          background: '#152a4a',
          borderRadius: 12,
          padding: '18px 20px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.2 }}>
              CATALOGO TENIS DE MESA
            </div>
            <div style={{ color: '#94b8d8', fontSize: 11, fontWeight: 600, letterSpacing: 1, marginTop: 3, textTransform: 'uppercase' }}>
              Productos con entrega inmediata
            </div>
          </div>
          {filtro !== 'Todos' && (
            <div style={{
              background: '#c8102e', color: '#fff',
              fontSize: 12, fontWeight: 800, letterSpacing: 1,
              padding: '5px 14px', borderRadius: 6, whiteSpace: 'nowrap',
              textTransform: 'uppercase', marginTop: 2,
            }}>
              {filtro.toUpperCase()}
            </div>
          )}
        </div>

        {/* Filtros de categoría */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {cats.map(c => (
            <button
              key={c}
              onClick={() => setFiltro(c)}
              style={{
                padding: '6px 18px',
                borderRadius: 6,
                border: 'none',
                background: filtro === c ? '#c8102e' : '#e2e8f0',
                color: filtro === c ? '#fff' : '#334155',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                letterSpacing: 0.5, textTransform: 'uppercase',
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Grid de productos */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}>
          {filtrados.map(p => (
            <div key={p.id} style={{
              background: '#fff',
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* Imagen */}
              <div style={{
                background: '#f4f6f8',
                aspectRatio: '1 / 1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: 10,
              }}>
                {imgError.has(p.id) ? (
                  <div style={{
                    width: '100%', height: '100%',
                    background: '#e8ecf0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', fontSize: 11,
                  }}>
                    Sin imagen
                  </div>
                ) : (
                  <Image
                    src={p.img}
                    alt={p.nombre.replace('\n', ' ')}
                    width={200}
                    height={200}
                    style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                    onError={() => setImgError(prev => new Set(prev).add(p.id))}
                  />
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '10px 12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: '#1a2a4a',
                  textAlign: 'center', lineHeight: 1.3,
                  whiteSpace: 'pre-line',
                  textTransform: 'uppercase',
                }}>
                  {p.nombre}
                </div>

                <a
                  href={`https://wa.me/${WA}?text=${encodeURIComponent(mensajeWA(p))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    background: '#2563eb',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    padding: '7px 10px',
                    borderRadius: 6,
                    textDecoration: 'none',
                  }}
                >
                  {formatPrecio(p.precio)}{p.precioSufijo ? ` ${p.precioSufijo}` : ''}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          background: '#152a4a',
          borderRadius: 12,
          padding: '16px 20px',
          textAlign: 'center',
          color: '#fff',
        }}>
          <div style={{ fontSize: 10, color: '#94b8d8', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            Coordinar compra con profesor
          </div>
          <a
            href={`https://wa.me/${WA}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>
              RODRIGO SALAZAR
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#5ba3d9', marginTop: 2 }}>
              +56 9 6834 2721
            </div>
          </a>
          <div style={{ fontSize: 10, color: '#94b8d8', marginTop: 8, letterSpacing: 0.5 }}>
            STOCK LIMITADO — CONSULTAR DISPONIBILIDAD
          </div>
        </div>

      </div>
    </AppLayout>
  )
}
