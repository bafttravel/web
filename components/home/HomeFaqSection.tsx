"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";

const faqs = [
  {
    q: "¿Cómo reservo mi paquete?",
    a: "Elegí tu paquete, seleccioná fecha y completá tus datos. Luego confirmás el pago para asegurar tu lugar.",
  },
  {
    q: "¿Qué incluye el precio publicado?",
    a: "Cada paquete detalla lo incluido y lo no incluido. Si tenés dudas, escribinos y te asesoramos.",
  },
  {
    q: "¿Puedo pagar en cuotas?",
    a: "Depende del medio de pago y de la disponibilidad del paquete. En checkout vas a ver las opciones habilitadas.",
  },
  {
    q: "¿Las fechas tienen cupos limitados?",
    a: "No. Las fechas cargadas siguen disponibles aunque haya compras. Cada reserva sí respeta el máximo de personas configurado.",
  },
] as const;

export default function HomeFaqSection() {
  return (
    <section id="faq" className="bg-[#F5FAFF] py-12 md:py-16">
      <div className="container mx-auto px-4 md:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-140px" }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="h-10 w-10 rounded-2xl bg-white border border-[#2BB8BF]/15 shadow-sm flex items-center justify-center">
            <HelpCircle className="h-5 w-5 text-[#2BB8BF]" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Preguntas frecuentes</div>
            <h2 className="text-lg md:text-2xl font-extrabold text-gray-900">Preguntas frecuentes</h2>
          </div>
        </motion.div>

        <Accordion.Root type="single" collapsible defaultValue="item-0" className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.q}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: index * 0.03 }}
            >
              <Accordion.Item
                value={`item-${index}`}
                className="rounded-2xl bg-white border border-gray-100 shadow-[0_12px_36px_rgba(0,0,0,0.06)] overflow-hidden"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                    <span className="text-sm md:text-base font-semibold text-gray-900">{faq.q}</span>
                    <ChevronDown className="h-5 w-5 text-[#2BB8BF] transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden border-t border-gray-100 px-5 text-sm md:text-base text-gray-600 data-[state=closed]:hidden">
                  <div className="py-4">{faq.a}</div>
                </Accordion.Content>
              </Accordion.Item>
            </motion.div>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
