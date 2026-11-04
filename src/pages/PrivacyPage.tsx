import { Link } from 'react-router';

/**
 * Describe lo que el sitio hace hoy con los datos: si cambia lo que se guarda o se envía,
 * actualizá esta página.
 */
export default function PrivacyPage() {
  return (
    <article className="cine-plate-block max-w-prose text-sm leading-relaxed">
      <h1 className="mb-6 text-lg sm:text-2xl">Política de privacidad</h1>

      {/* Resumen al inicio: el texto supera las 300 palabras (WCAG 3 "Summaries available"). */}
      <section aria-labelledby="resumen" className="cine-alert-info px-4 py-3">
        <h2 id="resumen" className="mb-2 text-base font-bold">
          En resumen
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>No usamos cookies, analítica ni publicidad.</li>
          <li>Los datos de tu tarjeta se revisan en tu navegador y nunca salen de él.</li>
          <li>
            Los administradores ven las cuentas, las reservas y los mensajes para gestionar el cine.
          </li>
          <li>Podés pedir ver, corregir o borrar tus datos desde Contacto.</li>
        </ul>
      </section>

      <h2 className="mt-8 mb-3 text-base font-bold">1. Alcance</h2>
      <p>
        Esta política explica cómo Cine, el frontend del backend TP-AppsInter, trata la información
        de quienes lo usan. Al crear una cuenta o usar los servicios con sesión iniciada aceptás
        esta política. Nunca tenés que dar datos personales para recorrer el sitio: podés ver la
        cartelera, las películas y las funciones sin cuenta. Solo la necesitás para reservar o para
        escribirnos.
      </p>
      <p className="mt-3">
        Las consultas sobre esta política se hacen por la página de{' '}
        <Link to="/contact" className="cine-link">
          Contacto
        </Link>
        .
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">2. Datos que recolectamos</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Cuenta:</strong> nombre, apellido, correo electrónico y contraseña. La contraseña
          solo se usa para validar tu ingreso y nunca se muestra en el sitio.
        </li>
        <li>
          <strong>Reservas:</strong> la función, los asientos, los productos de confitería, los
          importes y las fechas de creación y, si corresponde, de cancelación. Cada reserva queda
          asociada a tu cuenta.
        </li>
        <li>
          <strong>Mensajes de contacto:</strong> la categoría, el asunto, el texto, las fechas de
          envío y edición, y cuándo lo leyó un administrador. El autor se toma de tu sesión, así que
          no se vuelven a pedir tu nombre ni tu correo.
        </li>
        <li>
          <strong>Datos de pago:</strong> los datos de la tarjeta se validan solo en tu navegador.
          <strong>No se envían ni se guardan</strong> en ningún servidor y no forman parte de la
          reserva.
        </li>
      </ul>

      <h2 className="mt-8 mb-3 text-base font-bold">3. Uso sin cuenta</h2>
      <p>
        Si navegás sin iniciar sesión, el sitio solo consulta información pública: películas,
        funciones, disponibilidad de asientos y productos. Cine no usa cookies, ni herramientas de
        analítica, ni seguimiento publicitario.
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">4. Almacenamiento en tu navegador</h2>
      <p>
        En lugar de cookies, el sitio guarda dos datos en el almacenamiento local de tu navegador:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          <code>cine.auth.tokens</code>: los tokens de tu sesión, para que no tengas que volver a
          ingresar al recargar la página. Se borran al cerrar sesión.
        </li>
        <li>
          <code>cine:fondo</code>: el fondo que elegiste (animado, quieto o liso).
        </li>
      </ul>
      <p className="mt-3 text-ink-500">
        Podés borrar ambos desde la configuración de tu navegador cuando quieras.
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">5. Finalidad</h2>
      <p>Usamos los datos solo para:</p>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>crear y administrar tu cuenta;</li>
        <li>retener asientos, cotizar y registrar tus reservas, y mostrarte tu historial;</li>
        <li>leer y responder tus mensajes de contacto;</li>
        <li>operar el cine: programar funciones, administrar salas y controlar el stock.</li>
      </ul>
      <p className="mt-3">No vendemos tus datos ni los cedemos a terceros.</p>

      <h2 className="mt-8 mb-3 text-base font-bold">6. Quién accede a tus datos</h2>
      <p>
        Los usuarios con rol de administrador pueden ver el listado de usuarios, todas las reservas
        y los mensajes de contacto, porque los necesitan para gestionar el cine. Nadie más puede ver
        tus datos ni tus reservas.
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">7. Servicios de terceros</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Los pósters y fondos de las películas se cargan desde direcciones externas que configuran
          los administradores. Al mostrarlos, tu navegador se conecta con esos servidores, que
          pueden registrar tu dirección IP según sus propias políticas.
        </li>
        <li>
          Los enlaces a tráilers abren sitios externos que tienen sus propias políticas de
          privacidad.
        </li>
        <li>
          Las tipografías se sirven desde este mismo sitio: no se hacen pedidos a servicios de
          fuentes externos.
        </li>
      </ul>

      <h2 className="mt-8 mb-3 text-base font-bold">8. Seguridad</h2>
      <p>
        Tu sesión viaja en un encabezado de autorización, nunca en cookies. El servidor vuelve a
        verificar tu rol y el estado de tu cuenta en cada pedido, y cambiar tu contraseña cierra tus
        otras sesiones abiertas. Aun así, ningún sistema es infalible: cuidá tu contraseña y cerrá
        sesión en equipos compartidos.
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">9. Conservación</h2>
      <p>
        Conservamos tus datos mientras tu cuenta exista. Si un administrador da de baja una cuenta,
        esta ya no puede iniciar sesión, pero su historial de reservas se conserva como registro de
        las operaciones realizadas.
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">10. Tus derechos</h2>
      <p>
        Según la Ley 25.326 de Protección de los Datos Personales, podés pedir acceso a tus datos,
        su rectificación, su actualización y, cuando corresponda, su supresión. El acceso es
        gratuito a intervalos no menores a seis meses, salvo que acredites un interés legítimo
        (artículo 14, inciso 3, de la ley).
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        <li>
          Tu nombre y apellido los podés corregir vos mismo en{' '}
          <Link to="/account" className="cine-link">
            Tu cuenta
          </Link>
          .
        </li>
        <li>
          Para cambiar tu correo, pedir la baja de tu cuenta o ejercer cualquier otro derecho,
          escribinos desde{' '}
          <Link to="/contact" className="cine-link">
            Contacto
          </Link>
          .
        </li>
      </ul>
      <p className="mt-3 text-ink-500">
        La Agencia de Acceso a la Información Pública (AAIP), como órgano de control de la Ley
        25.326, atiende las denuncias y reclamos por incumplimiento de las normas de protección de
        datos personales.
      </p>

      <h2 className="mt-8 mb-3 text-base font-bold">11. Modificaciones</h2>
      <p>
        Podemos actualizar esta política. Cuando lo hagamos, publicaremos la nueva versión en esta
        página con su fecha.
      </p>

      <p className="mt-10 text-xs text-ink-500">Última actualización: 1 de noviembre de 2026.</p>
    </article>
  );
}
