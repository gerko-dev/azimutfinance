// Le worker de pdfjs-dist n'expose aucun type : il n'est pas fait pour etre
// consomme, seulement charge. lib/tauxPdfParser l'importe pour une raison qui
// n'a rien a voir avec son API — rendre le fichier visible au traceur de Next,
// qui ne l'embarquait pas dans la fonction deployee et faisait echouer le
// parsing en production (« Setting up fake worker failed »).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
