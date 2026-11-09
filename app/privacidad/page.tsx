import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import HomeFooter from '@/components/home/HomeFooter';
import { CONTACT_INFO } from '@/lib/constants';
import { getLocale } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return locale === 'en'
    ? { title: 'Privacy and cookies', description: 'Information about necessary cookies and BAFT analytics tools.' }
    : { title: 'Privacidad y cookies', description: 'Información sobre cookies necesarias y herramientas de analítica de BAFT.' };
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const isEnglish = locale === 'en';

  return (
    <>
      <Navbar variant="homeMockup" reserveSpace />
      <div className="min-h-[60vh] bg-white px-4 py-12 sm:py-16">
        <article className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            {isEnglish ? 'Privacy' : 'Privacidad'}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {isEnglish ? 'Privacy and cookies' : 'Privacidad y cookies'}
          </h1>
          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 sm:text-base">
            <section>
              <h2 className="text-lg font-semibold text-slate-900">
                {isEnglish ? 'Necessary storage' : 'Almacenamiento necesario'}
              </h2>
              <p className="mt-2">
                {isEnglish
                  ? 'The site uses necessary browser storage for essential features, such as remembering your language and cookie choice.'
                  : 'El sitio utiliza almacenamiento necesario del navegador para funciones esenciales, como recordar el idioma y tu elección de cookies.'}
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-slate-900">
                {isEnglish ? 'Optional analytics' : 'Analíticas opcionales'}
              </h2>
              <p className="mt-2">
                {isEnglish
                  ? 'Only after you opt in, we load Google Analytics 4 to measure site traffic and booking activity, and Microsoft Clarity to understand how visitors use the site. These services may use analytics cookies and process browsing and interaction data.'
                  : 'Solo si las aceptás, cargamos Google Analytics 4 para medir el tráfico y la actividad de reservas, y Microsoft Clarity para entender cómo se usa el sitio. Estos servicios pueden utilizar cookies analíticas y procesar datos de navegación e interacción.'}
              </p>
              <p className="mt-2">
                {isEnglish
                  ? 'Analytics events are designed not to include contact details, WhatsApp message text, or other direct identifiers. Analytics remains off unless you opt in; you can change your choice at any time using Cookie settings in the footer.'
                  : 'Los eventos de analítica están diseñados para no incluir datos de contacto, el texto de mensajes de WhatsApp ni otros identificadores directos. Las analíticas permanecen desactivadas hasta que las aceptás; podés cambiar tu elección cuando quieras desde “Configurar cookies” en el pie de página.'}
              </p>
              <p className="mt-2">
                {isEnglish
                  ? 'Clarity recording is disabled on checkout, reservation lookup, account, and internal administration pages. Sensitive page content is masked as an additional safeguard.'
                  : 'La grabación de Clarity se desactiva en el checkout, la consulta de reservas, las cuentas y las páginas internas de administración. El contenido de páginas sensibles también se enmascara como medida adicional.'}
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-slate-900">
                {isEnglish ? 'Third-party information' : 'Información de terceros'}
              </h2>
              <p className="mt-2">
                {isEnglish ? 'Learn more about how these providers handle data:' : 'Podés consultar cómo gestionan los datos estos proveedores:'}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li><a className="underline underline-offset-2" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></li>
                <li><a className="underline underline-offset-2" href="https://privacy.microsoft.com/privacystatement" target="_blank" rel="noopener noreferrer">Microsoft Privacy Statement</a></li>
              </ul>
            </section>
            <p>
              {isEnglish ? 'Questions about this notice? Contact us at ' : '¿Tenés consultas sobre este aviso? Escribinos a '}
              <a className="font-semibold underline underline-offset-2" href={`mailto:${CONTACT_INFO.email}`}>{CONTACT_INFO.email}</a>.
            </p>
            <p className="text-xs leading-5 text-slate-500">
              {isEnglish
                ? 'This notice describes analytics cookies and does not replace a complete privacy policy. The site owner should review it and add any required information about the data controller, retention periods, and applicable rights before publication.'
                : 'Este aviso describe las cookies analíticas y no reemplaza una política de privacidad completa. Antes de publicarlo, el titular del sitio debe revisarlo y completar la información que corresponda sobre el responsable, los plazos de conservación y los derechos aplicables.'}
            </p>
            <Link href={`/${locale}`} className="inline-flex font-semibold text-slate-900 underline underline-offset-2">
              {isEnglish ? 'Back to home' : 'Volver al inicio'}
            </Link>
          </div>
        </article>
      </div>
      <HomeFooter />
    </>
  );
}
