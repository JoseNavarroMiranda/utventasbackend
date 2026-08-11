# Migración SQL para Railway

> En Railway ejecuta cada sentencia por separado (una a la vez, en orden).

## 1) Agregar columna suspendido a productos

```sql
ALTER TABLE productos ADD COLUMN suspendido TINYINT(1) NOT NULL DEFAULT 0;
```

## 1b) Agregar columna descripcion a disputas

```sql
ALTER TABLE disputas ADD COLUMN descripcion TEXT NULL;
```

## 2) Crear tabla disputa_imagenes

```sql
CREATE TABLE IF NOT EXISTS disputa_imagenes (
  imagen_id INT NOT NULL AUTO_INCREMENT,
  disputa_id INT NOT NULL,
  url_imagen VARCHAR(255) NOT NULL,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (imagen_id),
  FOREIGN KEY (disputa_id) REFERENCES disputas(disputa_id) ON DELETE CASCADE
);
```

## 3) Crear tabla solicitudes_relanzamiento

```sql
CREATE TABLE IF NOT EXISTS solicitudes_relanzamiento (
  solicitud_id INT NOT NULL AUTO_INCREMENT,
  producto_id INT NOT NULL,
  vendedor_id INT NULL,
  disputa_id INT NULL,
  descripcion TEXT NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  resolucion_texto TEXT NULL,
  admin_id INT NULL,
  fecha_solicitud DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_revision DATETIME NULL,
  PRIMARY KEY (solicitud_id),
  FOREIGN KEY (producto_id) REFERENCES productos(producto_id) ON DELETE CASCADE,
  FOREIGN KEY (vendedor_id) REFERENCES usuarios(usuario_id) ON DELETE SET NULL
);
```

## 4) Crear tabla solicitud_relanzamiento_imagenes

```sql
CREATE TABLE IF NOT EXISTS solicitud_relanzamiento_imagenes (
  imagen_id INT NOT NULL AUTO_INCREMENT,
  solicitud_id INT NOT NULL,
  url_imagen VARCHAR(255) NOT NULL,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (imagen_id),
  FOREIGN KEY (solicitud_id) REFERENCES solicitudes_relanzamiento(solicitud_id) ON DELETE CASCADE
);
```

## 5) Crear tabla historico_pedidos

```sql
CREATE TABLE IF NOT EXISTS historico_pedidos (
  historico_id INT NOT NULL AUTO_INCREMENT,
  pedido_id INT NULL,
  estado_anterior VARCHAR(40) NULL,
  estado_nuevo VARCHAR(40) NULL,
  usuario_accion_id INT NULL,
  fecha_cambio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notas_auditoria TEXT NULL,
  PRIMARY KEY (historico_id),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(pedido_id) ON DELETE SET NULL
);
```

## 6) Agregar columna motivo_suspension a productos (comentario del admin)

```sql
ALTER TABLE productos ADD COLUMN motivo_suspension TEXT NULL AFTER suspendido;
```
