#!/usr/bin/env python3
"""Prueba RPC reales en una BD nueva de un contenedor LOCAL desechable.
Uso: python scripts/test-torneos-finanzas-postgres.py cmsports-torneos-audit-pg
No usa credenciales ni conexiones a Supabase. Borra únicamente su BD temporal.
"""
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

root = Path(__file__).resolve().parents[1]
container = sys.argv[1] if len(sys.argv) > 1 else 'cmsports-torneos-audit-pg'
if not container.startswith('cmsports-torneos-audit-'):
    raise SystemExit('Usa un contenedor de prueba con prefijo cmsports-torneos-audit-')
env = {k: v for k, v in os.environ.items() if k not in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH')}
docker = ['docker', '--host=unix:///var/run/docker.sock', 'exec', '-i', container]
database = 'audit_' + uuid.uuid4().hex

def sql(text, db=database):
    return subprocess.run(docker + ['psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qAt'], input=text, text=True, capture_output=True, env=env, check=True).stdout

def function(file, name):
    source = (root / 'supabase/migrations' / file).read_text()
    match = re.search(r'CREATE OR REPLACE FUNCTION public\.' + re.escape(name) + r'\([\s\S]*?\n\$\$;', source)
    if not match:
        raise RuntimeError('No se encontró ' + name)
    return match[0]

try:
    sql('CREATE DATABASE ' + database, 'postgres')
    sql("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;", 'postgres')
    sql((root / 'scripts/tests/torneos-finanzas.sql').read_text())
    for name in ['_finanzas_admin_contexto', '_finanzas_reclamar_operacion']:
        sql(function('039_finanzas_atomicas.sql', name))
    for name in ['subir_pagos_torneo_a_finanzas_atomico', 'registrar_gastos_gestion_torneo_atomico']:
        sql(function('137_auditoria_torneos_fecha_gastos_y_vista.sql', name))
    sql(function('271_campeon_y_premio_del_consuelo.sql', 'guardar_premios_torneo_atomico'))
    sql((root / 'supabase/migrations/303_torneos_integridad_financiera.sql').read_text())
    sql((root / 'scripts/tests/torneos-finanzas-casos.sql').read_text())
    # La segunda persona paga mientras el RPC ya contó la primera. Un
    # trigger de prueba pausa el INSERT contable, antes de marcar los pagos.
    sql("""
      INSERT INTO torneos(id,club_id,nombre,cuota_inscripcion) VALUES
      ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','Concurrente',3000);
      INSERT INTO torneo_pagos(torneo_id,jugador_id,estado,metodo_pago) VALUES
      ('00000000-0000-4000-8000-000000000010',gen_random_uuid(),'pagado','efectivo');
      CREATE FUNCTION pausar_traspaso_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.torneo_id='00000000-0000-4000-8000-000000000010' THEN PERFORM pg_sleep(3); END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER pausa_prueba BEFORE INSERT ON movimientos FOR EACH ROW EXECUTE FUNCTION pausar_traspaso_prueba();
    """)
    proceso = subprocess.Popen(docker + ['psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-qAt'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    proceso.stdin.write("SET application_name='cmsports_audit_transfer'; SELECT subir_pagos_torneo_a_finanzas_atomico('00000000-0000-4000-8000-000000000010',NULL,gen_random_uuid());")
    proceso.stdin.close()
    for intento in range(40):
        if sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='cmsports_audit_transfer' AND wait_event='PgSleep'").strip() == '1':
            break
        time.sleep(0.1)
    else:
        raise RuntimeError('No se alcanzó la pausa del traspaso concurrente')
    sql("INSERT INTO torneo_pagos(torneo_id,jugador_id,estado,metodo_pago) VALUES ('00000000-0000-4000-8000-000000000010',gen_random_uuid(),'pagado','transferencia');")
    if proceso.wait(timeout=15) != 0:
        raise RuntimeError(proceso.stderr.read())
    sql("""
      SELECT comprobar((SELECT count(*)=1 FROM torneo_pagos WHERE torneo_id='00000000-0000-4000-8000-000000000010' AND subido_a_finanzas),'Se marcó un pago que no entró al movimiento');
      SELECT comprobar((SELECT sum(monto)=3000 FROM movimientos WHERE torneo_id='00000000-0000-4000-8000-000000000010'),'El ingreso concurrente no coincide');
      SELECT comprobar((SELECT count(*)=1 FROM torneo_pagos WHERE torneo_id='00000000-0000-4000-8000-000000000010' AND NOT subido_a_finanzas),'El pago nuevo no quedó pendiente de traspaso');
    """)
    print('OK: traspasos, efectivo/transferencia, exentos, reintentos, pago contabilizado, premios, gastos, fecha Chile y cobro concurrente.')
finally:
    sql('DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)', 'postgres')
