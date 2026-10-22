export const HERO_CAR = {
  id: 'hero-car-mmc-generic-sport-coupe',
  name: 'Generic Sport Coupé Car — MMC Works',
  creator: 'MMC Works',
  sourceUrl:
    'https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882',
  licence: 'CC-BY-4.0',
  archiveLicenceText: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution:
    'Generic Sport Coupé Car by MMC Works, from https://sketchfab.com/3d-models/generic-sport-coupe-car-820a13c4831c41959ce75e6c2014e882; licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The supplied archive replaces textures/media.png with a neutral dashboard screen. The game conversion aligns the model to the vehicle physics, creates LODs, and optimizes textures and geometry for runtime.',
  archiveName: 'hero-car-candidate-neutral-screen.zip',
  archiveBytes: 79_563_959,
  archiveSha256: '222b8a9322a94305a5065d9adb56836c93451f040baea45dca4e774ba8f178e6',
  fbxPath: 'source/coupe-sport-generic-mmc.fbx',
  fbxSha256: '4d11eb251bd0958a749368befc30ac308cc80f226de82b5a98019718cb011206',
  mediaPath: 'textures/media.png',
  mediaSha256: 'a9770ac049a95fe7037eccec1189948934306b510487d201378f666e77a40e8c',
  blenderVersion: '4.3.2',
  modelPath: 'assets/models/hero-car-mmc-generic-sport-coupe.glb',
  budgetClass: 'hero',
  lodRatios: [1, 0.45, 0.15],
  maxTextureSize: 2048,
  retrievalDate: '2026-10-23',
};

export const HERO_WHEELS = [
  { key: 'front-left', sourcePivot: 'Coupe-Wheel.Ft.L', side: 'left', axle: 'front' },
  { key: 'front-right', sourcePivot: 'Coupe-Wheel.Ft.R', side: 'right', axle: 'front' },
  { key: 'rear-left', sourcePivot: 'Coupe-Wheel.Bk.L', side: 'left', axle: 'rear' },
  { key: 'rear-right', sourcePivot: 'Coupe-Wheel.Bk.R', side: 'right', axle: 'rear' },
];
