// Which everyday Spanish words does the word list not hold at all? (list written by the auditor: words every A1–B1 learner meets; lemmas)
import { esLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/es';
const ES = `
aun incluso quizás acaso jamás apenas casi demasiado bastante pronto todavía entonces luego mientras durante hacia contra según salvo excepto aunque sino pues además tampoco también sobre tras ante bajo cabe mediante versus vía
ello esto eso aquello conmigo contigo consigo cualquiera quienquiera alguien nadie algo nada ambos sendos demás varios cierto tal mismo propio ajeno
sexto séptimo octavo noveno décimo docena par mitad tercio doble triple medio billón
bus camión televisor radio computadora celular teléfono internet correo mensaje pantalla contraseña red página programa sistema
caso cosa gusto poder mal bien este ruido fila dulce charco presupuesto ministro conferencia prensa inflación oposición inversión educación cifra desempleo alcaldía fondo medida investigación situación información organización población relación condición atención canción nación
voluntad dignidad conciencia tentación deudor ser humano derecho libertad igualdad paz
colonia barrio aldea municipio departamento alcalde diputado presidente gobierno policía ejército iglesia pastor culto oración ayuno ofrenda diezmo bautismo
goma maje púchica milpa champa pisto cipote güirro catracho baleada pulpería chele macizo chamba bolo cheque vaya
término crisis régimen carácter águila orden cura guía frente capital corte cometa llama sobre cerca bota medida vista hecho dicho puesto
crear preferir recomendar producir reducir introducir exigir recoger vencer averiguar fijar librar cobrar arrancar arruinar investigar resultar madrugar advertir comportar perjudicar botar santificar acontecer desarrollar funcionar considerar realizar añadir enamorar duchar afeitar peinar conversar charlar platicar regresar manejar parquear estacionar chequear necesitar
imprimir satisfacer prever componer disponer convenir prevenir intervenir contener sostener retener entretener predecir contradecir maldecir atraer distraer
económico cuidadoso simple probable grave fraternal increíble posible terrible horrible agradable responsable interesante importante aburrido divertido cansado enojado nervioso tranquilo
chiquito poquito bonito lindo feo guapo gordo flaco delgado alto bajo joven viejo nuevo
hola adiós gracias perdón disculpe salud bienvenido felicidades ojalá vaya vale bueno oye mira claro
usted ustedes vos vosotros
`;
const words = [...new Set(ES.split(/\s+/).filter(Boolean))];
const has = (w: string) => esLexicon.lookup(w).length > 0 || !!esLexicon.find(w);
const missing = words.filter((w) => !has(w));
console.log(`es: ${words.length} everyday words checked; ${missing.length} are not in the word list (${(100 * missing.length / words.length).toFixed(0)} %)\n  missing: ${missing.join(' ')}\n  held: ${words.filter(has).join(' ')}`);
// homograph coverage: which part-of-speech readings does the list hold for these forms?
for (const w of ['para', 'nada', 'entre', 'sobre', 'este', 'como', 'bajo', 'salvo', 'mal', 'poder', 'ser', 'caso', 'gusto', 'cerca', 'corte', 'capital', 'la', 'los', 'las', 'lo', 'se', 'que', 'sí', 'una', 'aquel', 'medio', 'bien', 'haber', 'deber', 'bota', 'llama', 'cura', 'frente', 'papa']) {
  console.log(`  ${w}: ${esLexicon.lookup(w).map((h: any) => `${h.entry.lemma}/${h.entry.pos}`).join(', ') || '—'}`);
}
