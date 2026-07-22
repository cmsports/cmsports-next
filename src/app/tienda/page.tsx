'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import AppLayout from '../layout-app'
import { usePerfil } from '@/lib/auth/PerfilProvider'
import { createClient } from '@/lib/supabase/client'
import { ShoppingBag } from 'lucide-react'
import WhatsAppBtn from '@/components/WhatsAppBtn'

const WA = '56922515010'
const AUMENTO_PRECIO = 2000
const DESCUENTO_CLUB = 1000

const productos = [
  { name: 'Yinhe 01 Pro', cat: 'Madero', marca: 'Yinhe', desc: 'Madero profesional 5+2 capas. Velocidad y control para juego ofensivo.', precio: 60000, img: '/tienda/1.png' },
  { name: 'Xiom Vega Europe', cat: 'Goma', marca: 'Xiom', desc: 'Muy elástica con Carbo Sponge blanda. Ideal para revés con gran control.', precio: 33000, img: '/tienda/2.png' },
  { name: 'Xiom Vega X', cat: 'Goma', marca: 'Xiom', desc: 'Topsheet natural + esponja Carbo dureza media-alta. Ofensiva versátil.', precio: 35000, img: '/tienda/3.png' },
  { name: 'Loki Rxton 5 Pro', cat: 'Goma', marca: 'Loki', desc: 'Esponja azul alta densidad, energía interna. Arco estable, precisión.', precio: 20000, img: '/tienda/4.png' },
  { name: 'Loki GTX Pro', cat: 'Goma', marca: 'Loki', desc: 'Muy pegajosa con esponja compacta y dura. Ofensiva agresiva.', precio: 25000, img: '/tienda/5.png' },
  { name: 'Yinhe Big Dipper', cat: 'Goma', marca: 'Yinhe', desc: 'Topsheet pegajoso con esponja tensada. Híbrida para topspin cerca de mesa.', precio: 25000, img: '/tienda/6.png' },
  { name: 'Nittaku Genextion V2C', cat: 'Goma', marca: 'Nittaku', desc: 'Híbrida de alta fricción, esponja muy dura. Elite ofensiva.', precio: 54000, img: '/tienda/7.png' },
  { name: 'Reactor Thunder', cat: 'Goma', marca: 'Reactor', desc: 'Pegajosa con esponja densa. Precisión y topspins cargados.', precio: 25000, img: '/tienda/8.png' },
]

const cats = ['Todos', ...new Set(productos.map(p => p.cat))]

function formatPrecio(n: number) {
  return '$' + n.toLocaleString('es-CL')
}

export default function TiendaPage() {
  const { perfil } = usePerfil()
  const [filtro, setFiltro] = useState('Todos')
  const [clubNombre, setClubNombre] = useState('tu club')

  useEffect(() => {
    if (!perfil?.club_id) return
    const supabase = createClient()
    supabase.from('clubes').select('nombre').eq('id', perfil.club_id).single()
      .then(({ data }) => {
        if (data?.nombre) setClubNombre(data.nombre)
      })
  }, [perfil?.club_id])

  const filtrados = filtro === 'Todos' ? productos : productos.filter(p => p.cat === filtro)

  if (!perfil) return null

  return (
    <AppLayout perfil={perfil}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0e0e10, #1a1a1e 60%, #3a0812)',
          borderRadius: 16, padding: '28px 28px 24px', marginBottom: 20, color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <ShoppingBag size={22} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>
              Colaborador oficial
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
            Tienda <span style={{ color: '#c8102e' }}>DoubleTT</span>
          </h1>
          <p style={{ fontSize: 14, opacity: 0.8, marginTop: 6, maxWidth: 500 }}>
            Todos los jugadores de <strong>{clubNombre}</strong> tienen $1.000 de descuento en cada producto.
          </p>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {cats.map(c => (
            <button key={c} onClick={() => setFiltro(c)} style={{
              padding: '7px 16px', borderRadius: 20, border: '1px solid #e2e8f0',
              background: filtro === c ? '#4f46e5' : '#fff',
              color: filtro === c ? '#fff' : '#334155',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              {c}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {filtrados.map(p => {
            const precioLista = p.precio + AUMENTO_PRECIO
            const precioClub = precioLista - DESCUENTO_CLUB
            const mensajeWhatsApp = `Hola DoubleTT! Vengo de parte del club ${clubNombre}. Quiero consultar por ${p.name}. Precio lista: ${formatPrecio(precioLista)}. Descuento jugadores del club: ${formatPrecio(DESCUENTO_CLUB)}. Precio final: ${formatPrecio(precioClub)}.`
            return (
            <div key={p.name} style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden',
              border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                aspectRatio: '1/1', background: '#f8fafc', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: 12,
              }}>
                <Image src={p.img} alt={p.name} width={200} height={200}
                  style={{ objectFit: 'contain', maxWidth: '100%', maxHeight: '100%' }} />
              </div>
              <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 1 }}>
                  {p.cat} · {p.marca}
                </span>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: '4px 0', color: '#0f172a' }}>{p.name}</h3>
                <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, flex: 1 }}>{p.desc}</p>
                <div style={{ marginTop: 8 }} className="tabular-nums">
                  <div style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through' }}>
                    Antes {formatPrecio(precioLista)}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#c8102e' }}>
                    {formatPrecio(precioClub)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
                    Descuento club: -{formatPrecio(DESCUENTO_CLUB)}
                  </div>
                </div>
                <WhatsAppBtn
                  href={`https://wa.me/${WA}?text=${encodeURIComponent(mensajeWhatsApp)}`}
                  style={{ marginTop: 10, padding: '9px 14px', borderRadius: 10, fontSize: 13 }}
                >
                  Cotizar por WhatsApp
                </WhatsAppBtn>
              </div>
            </div>
            )
          })}
        </div>

        {/* Aviso más productos */}
        <div style={{
          marginTop: 24, padding: '18px 22px', borderRadius: 12,
          background: '#fff', border: '1px solid #e2e8f0', textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            Hay más productos en bodega
          </p>
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            Si buscas algo que no está acá, pregunta directamente por WhatsApp.
          </p>
          <WhatsAppBtn
            href={`https://wa.me/${WA}?text=${encodeURIComponent(`Hola DoubleTT! Vengo de parte del club ${clubNombre}. Quiero consultar por un producto que no está en la tienda. Tengo el descuento de $1.000 asociado a los jugadores del club.`)}`}
            style={{ padding: '9px 20px', borderRadius: 10, fontSize: 13, display: 'inline-flex' }}
          >
            Consultar por más productos
          </WhatsAppBtn>
        </div>
      </div>
    </AppLayout>
  )
}
