# 08 · Roles y permisos

## Los seis roles

Están ordenados en jerarquía: cada rol incluye implícitamente los permisos del
anterior (`src/lib/auth.ts`, constante `JERARQUIA`).

| Nivel | Rol          | Quién es                                    |
| ----- | ------------ | ------------------------------------------- |
| 0     | `socio`      | Persona asociada. Rol por omisión al registrarse. |
| 1     | `promotor`   | Capta socios, captura expedientes y edita contenido del sitio. |
| 2     | `cajero`     | Registra pagos y movimientos de ahorro.     |
| 3     | `analista`   | Dictamina expedientes y solicitudes.        |
| 4     | `gerente`    | Autoriza desembolsos y consulta reportes.   |
| 5     | `admin`      | Control total, incluida la gestión de personal. |

## Qué puede hacer cada quien

| Acción                                  | socio | promotor | cajero | analista | gerente | admin |
| --------------------------------------- | :---: | :------: | :----: | :------: | :-----: | :---: |
| Ver su propio expediente                |   ✓   |    ✓     |   ✓    |    ✓     |    ✓    |   ✓   |
| Simular crédito                         |   ✓   |    ✓     |   ✓    |    ✓     |    ✓    |   ✓   |
| Solicitar crédito                       |   ✓   |    —     |   —    |    —     |    —    |   —   |
| **Entrar al panel**                     |   ✗   |    ✓     |   ✓    |    ✓     |    ✓    |   ✓   |
| Ver el padrón de socios                 |   ✗   |    ✓     |   ✓    |    ✓     |    ✓    |   ✓   |
| Dar de alta socios en ventanilla        |   ✗   |    ✓     |   ✗    |    ✓     |    ✓    |   ✓   |
| **Validar documentos KYC**              |   ✗   |    ✗     |   ✗    |    ✓     |    ✓    |   ✓   |
| **Aprobar el expediente de un socio**   |   ✗   |    ✗     |   ✗    |    ✓     |    ✓    |   ✓   |
| **Dictaminar solicitudes**              |   ✗   |    ✗     |   ✗    |    ✓     |    ✓    |   ✓   |
| **Desembolsar créditos**                |   ✗   |    ✗     |   ✗    |    ✗     |    ✓    |   ✓   |
| **Registrar pagos**                     |   ✗   |    ✗     |   ✓    |    ✓     |    ✓    |   ✓   |
| Cancelar un pago                        |   ✗   |    ✗     |   ✗    |    ✗     |    ✓    |   ✓   |
| Abrir cuentas y mover ahorro            |   ✗   |    ✗     |   ✓    |    ✗     |    ✓    |   ✓   |
| Ver cobranza y recalcular mora          |   ✗   |    ✗     |   ✓    |    ✓     |    ✓    |   ✓   |
| Editar contenido del sitio              |   ✗   |    ✓     |   ✗    |    ✗     |    ✓    |   ✓   |
| Atender mensajes y prospectos           |   ✗   |    ✓     |   ✓    |    ✓     |    ✓    |   ✓   |
| **Editar productos y tasas**            |   ✗   |    ✗     |   ✗    |    ✗     |    ✓    |   ✓   |
| Editar sucursales                       |   ✗   |    ✗     |   ✗    |    ✗     |    ✓    |   ✓   |
| Ver la bitácora                         |   ✗   |    ✗     |   ✗    |    ✗     |    ✓    |   ✓   |
| **Gestionar personal y roles**          |   ✗   |    ✗     |   ✗    |    ✗     |    ✗    |   ✓   |
| **Cambiar la configuración**            |   ✗   |    ✗     |   ✗    |    ✗     |    ✗    |   ✓   |

## Separación de funciones

El diseño mantiene separadas tres responsabilidades que no deben concentrarse en
una sola persona:

- **Quien dictamina** (analista) no puede desembolsar.
- **Quien desembolsa** (gerente) no captura el expediente.
- **Quien cobra** (cajero) no puede cancelar su propio cobro.

Es un control interno básico contra el fraude: cada operación con dinero deja
huella de al menos dos personas distintas, y todas quedan en la bitácora.

## Dónde se aplica cada permiso

Cada permiso se comprueba en tres lugares independientes:

**1. La navegación** (`src/layouts/LayoutAdmin.astro`)

```ts
const visibles = SECCIONES.filter((s) => alcanzaRol(perfil.rol, s.minimo))
```

Solo oculta enlaces. **No es seguridad**, es comodidad.

**2. La acción** (páginas y endpoints)

```ts
if (!alcanzaRol(perfil!.rol, 'analista')) {
  mensaje = { tipo: 'error', texto: 'Tu rol no permite dictaminar expedientes.' }
}
```

**3. La base de datos** (RLS y funciones)

```sql
create policy "productos de credito administrables"
  on productos_credito for all
  using (privado.tiene_rol('gerente', 'admin'));
```

```sql
if not privado.tiene_rol('gerente', 'admin') then
  raise exception 'Solo gerencia o administración pueden desembolsar créditos';
end if;
```

**La tercera es la que de verdad protege.** Aunque alguien llamara la API
directamente, la base rechaza la operación.

## Gestionar el personal

### Dar de alta

`/admin/usuarios` → **Dar de alta**. Solo un administrador.

Se crea la cuenta con contraseña provisional (mínimo 10 caracteres) y correo ya
confirmado —el personal se da de alta desde adentro, no tiene sentido pedirle
que confirme un correo que ya conocemos.

**Pídele que cambie la contraseña en su primer acceso.**

### Cambiar un rol

En la misma pantalla, desde el selector de cada fila.

Un administrador **no puede cambiar su propio rol ni desactivarse**: degradarse
por error dejaría la cooperativa sin acceso al panel sin forma de revertirlo.

### Dar de baja

Usa **Desactivar**, no borres la cuenta. Desactivar corta el acceso de inmediato
pero conserva su rastro en la bitácora y en los expedientes que haya
dictaminado. Borrarla dejaría huérfanos esos registros.

### Recuperar el acceso de administrador

Si nadie puede entrar al panel, promueve una cuenta desde el SQL Editor de
Supabase:

```sql
update perfiles set rol = 'admin', activo = true
where correo = 'direccion@tudominio.mx';
```

## Un socio que además es personal

Una persona puede ser socia de la cooperativa y trabajar en ella. Su perfil
tiene un rol de personal y su `perfil_id` está enlazado a un expediente en
`socios`.

Al entrar, el sistema la lleva a `/admin`, pero puede visitar `/portal` para ver
sus propios créditos. Las políticas RLS lo permiten porque cada consulta filtra
por `privado.socio_actual()`.

> **Conflicto de interés.** Nada impide técnicamente que un analista dictamine
> su propia solicitud. Es una decisión de control interno: establece por
> reglamento que las solicitudes del personal las dictamine gerencia, y usa la
> bitácora para verificarlo.

## Roles sugeridos por puesto

| Puesto en la cooperativa            | Rol         |
| ----------------------------------- | ----------- |
| Promotor de campo                   | `promotor`  |
| Cajero de ventanilla                | `cajero`    |
| Auxiliar financiero / analista      | `analista`  |
| Gerente de sucursal                 | `gerente`   |
| Gerente general / dirección         | `admin`     |
| Contralor interno                   | `gerente`   |
| Encargado de comunicación           | `promotor`  |

El contralor lleva `gerente` porque necesita la bitácora y los reportes, pero no
la gestión de personal ni la configuración del sistema.
