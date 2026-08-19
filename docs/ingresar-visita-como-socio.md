# Ingresar una visita como socio (cuota, correo y acceso)

**Estado:** código listo — falta desplegar y que Rodrigo acepte de nuevo la solicitud  
**Última actualización:** 2026-08-18

## Qué pasó

José Miguel Croff Brizuela (`13905776-7`, `jose.croff@gmail.com`) ya tenía
ficha en Buin como **visita** (`es_externo`): se creó al cargar el ranking 2026
del papel (migración 189). Por eso no aparece en `/jugadores` y, al aceptar la
solicitud, el `INSERT` chocaba con `jugadores_rut_key`.

## Qué se hace (y qué no)

No se borra la ficha. Si se borrara, se irían el ranking (TC"A" 20 y TCB 70),
partidos, pagos y lo que ya tuviera colgado.

Al aceptar la solicitud, si el RUT ya existe en el mismo club **y no tiene
cuenta**, se reutiliza esa fila: deja de ser visita, se le pone plan/cuota,
correo y acceso. El historial queda en el mismo `id`.

Archivo: `src/app/actions/solicitudes.ts`

## Cómo seguir

1. Desplegar este cambio (o probarlo en local contra la base).
2. En Solicitudes, volver a **Aceptar** a Croff: plan, grupos, matrícula,
   correo y contraseña, como siempre.
3. Comprobar en su ficha que sigue el ranking y que ya entra con el correo.

Si el RUT ya tiene cuenta, el sistema no pisa nada: hay que abrir la ficha.
