import OBR, { buildPath, buildLine, buildShape } from "@owlbear-rodeo/sdk";
import PathKitInit from "pathkit-wasm/bin/pathkit";
import wasm from "pathkit-wasm/bin/pathkit.wasm?url";
import { ID, sceneCache } from "./globals";
import { isBackgroundImage, isVisionFog, isActiveVisionLine, isPlayerWithVision } from "./itemFilters";
import { polygonMode } from "./visionPolygonMode";
import { lineMode } from "./visionLineMode";
import { squareDistance, comparePosition, isClose, mod } from "./mathutils";
import { Timer } from "./debug";
import { ObjectCache } from "./cache";

let megafog_index = 0;

export function setupContextMenus() {
  // This context menu appears on character tokens and determines whether they
  // to render their FoW or not
  OBR.contextMenu.create({
    id: `${ID}/toggle-vision-menu`,
    icons: [
      {
        icon: "/no-vision.svg",
        label: "Enable Vision",
        filter: {
          every: [{ key: "layer", value: "CHARACTER" }, { key: ["metadata", `${ID}/hasVision`], value: undefined}],
        },
      },
      {
        icon: "/icon.svg",
        label: "Disable Vision",
        filter: {
          every: [{ key: "layer", value: "CHARACTER" }],
        },
      },
    ],
    async onClick(ctx) {
      OBR.scene.items.updateItems(ctx.items, items => {
        for (const item of items) {
          if (item.metadata[`${ID}/hasVision`] && item.layer == "CHARACTER") {
            delete item.metadata[`${ID}/hasVision`];
          }
          else if (item.layer == "CHARACTER"){
            item.metadata[`${ID}/hasVision`] = true;
          }
        }
      });
    },
  });

  // This context menu appears on images on the MAP layer and is used to set
  // which image is the background image. It is used to compute how far the
  // shadows need to be rendered, among other things
  OBR.contextMenu.create({
    id: `${ID}/set-background-image`,
    icons: [
      {
        icon: "/set-background.svg",
        label: "Set as background image",
        filter: {
          every: [{ key: "layer", value: "MAP" }, { key: ["metadata", `${ID}/isBackgroundImage`], value: true, operator: "!="}],
        },
      },
    ],
    onClick(ctx) {
      if (ctx.items.length != 1)
        return;
      const item = ctx.items[0];
      OBR.scene.items.updateItems(item => item.layer == "MAP", items => {
        for (const other_item of items) {
          if (item.id != other_item.id && other_item.metadata[`${ID}/isBackgroundImage`])
            delete other_item.metadata[`${ID}/isBackgroundImage`];
          else if (item.id == other_item.id)
            other_item.metadata[`${ID}/isBackgroundImage`] = true;
        }
      });
    }
  });

  // This context appears on vision lines and lets the user toggle whether
  // they're active or not
  OBR.contextMenu.create({
    id: `${ID}/toggle-vision-line`,
    icons: [
      {
        icon: "/icon.svg",
        label: "Disable Vision Line",
        filter: {
          every: [{ key: ["metadata", `${ID}/isVisionLine`], value: true}, { key: ["metadata", `${ID}/disabled`], value: undefined}],
        },
      },
      {
        icon: "/no-vision.svg",
        label: "Enable Vision Line",
        filter: {
          every: [{ key: ["metadata", `${ID}/isVisionLine`], value: true}],
        },
      }
    ],
    onClick(ctx) {
      OBR.scene.items.updateItems(ctx.items, items => {
        for (const item of items) {
          if (item.metadata[`${ID}/isVisionLine`] && item.metadata[`${ID}/disabled`]) {
            delete item.metadata[`${ID}/disabled`];
          }
          else if (item.metadata[`${ID}/isVisionLine`]){
            item.metadata[`${ID}/disabled`] = true;
          }
        }
      });
    }
  });

  OBR.contextMenu.create({
    id: `${ID}/switch-one-sided-type`,
    icons: [
      {
        icon: "/two-sided.svg",
        label: "Two-sided",
        filter: {
          every: [{ key: ["metadata", `${ID}/isVisionLine`], value: true}, {key: ["metadata", `${ID}/oneSided`], value: undefined}],
        },
      },
      {
        icon: "/left-sided.svg",
        label: "One-sided left",
        filter: {
          every: [{ key: ["metadata", `${ID}/isVisionLine`], value: true}, {key: ["metadata", `${ID}/oneSided`], value: "left"}],
        },
      },
      {
        icon: "/right-sided.svg",
        label: "One-sided right",
        filter: {
          every: [{ key: ["metadata", `${ID}/isVisionLine`], value: true}],
        },
      }
    ],
    onClick(ctx) {
      OBR.scene.items.updateItems(ctx.items, items => {
        for (const item of items) {
          if (item.metadata[`${ID}/isVisionLine`] && item.metadata[`${ID}/oneSided`] == "right") {
            delete item.metadata[`${ID}/oneSided`];
          }
          else if (item.metadata[`${ID}/isVisionLine`] && item.metadata[`${ID}/oneSided`] == "left"){
            item.metadata[`${ID}/oneSided`] = "right";
          }
          else if (item.metadata[`${ID}/isVisionLine`]) {
            item.metadata[`${ID}/oneSided`] = "left";
          }
        }
      });
    }
  });
}

export function createTool() {
  // This is the tool the extension offers to draw vision liens
  OBR.tool.create({
    id: `${ID}/vision-tool`,
    icons: [
      {
        icon: "/icon.svg",
        label: "Setup Vision",
      },
    ],
    onClick() { OBR.tool.activateTool(`${ID}/vision-tool`); },
  });
}

// This tool doesn't do what the name implies and will be removed
export function createMode() {
    // Create "erase" mode
    // OBR.tool.createMode({
    //   id: `${ID}/erase-vision-mode`,
    //   icons: [
    //     {
    //       icon: "/add.svg", // mismatched item
    //       label: "Erase Vision",
    //       filter: {
    //         activeTools: [`${ID}/vision-tool`],
    //       },
    //     },
    //   ],
    //   async onClick() { 
    //     console.log(await OBR.scene.items.getItems());
    //    },
    // });
  
    // Create "add polygon" mode
    OBR.tool.createMode({
      id: `${ID}/add-vision-polygon-mode`,
      icons: [
        {
          icon: "/object.svg",
          label: "Add Obstruction Object",
          filter: {
            activeTools: [`${ID}/vision-tool`],
          },
        },
      ],
      onToolClick: polygonMode.onToolClick,
      onToolMove: polygonMode.onToolMove,
      onKeyDown: polygonMode.onKeyDown
    });

    // Create "add line" mode
    OBR.tool.createMode({
      id: `${ID}/add-vision-line-mode`,
      icons: [
        {
          icon: "/line.svg",
          label: "Add Obstruction Line",
          filter: {
            activeTools: [`${ID}/vision-tool`],
          },
        },
      ],
      onToolClick: lineMode.onToolClick,
      onToolMove: lineMode.onToolMove,
      onKeyDown: lineMode.onKeyDown
    });
}

export function createActions() {
}

// This function is responsible for updating the performance information in the
// main extension iframe
function updatePerformanceInformation(performanceInfo) {
  for (const [key, value] of Object.entries(performanceInfo)) {
    const element = document.getElementById(key);
    element.innerText = value;
  }
}

var PathKit;
var busy = false;
// Generally, only one player will move at one time, so let's cache the
// computed shadows for all players and only update if something has 
// changed
const playerShadowCache = new ObjectCache(false);
// This is the function responsible for computing the shadows and the FoW
async function computeShadow(event) {
  busy = true;
  if (!PathKit) {
    // Is this allowed?
    PathKit = await PathKitInit({ locateFile: () => wasm });
  }
  if (!(await OBR.scene.isReady())) {
    // If we change scenes we should invalidate the cache
    playerShadowCache.invalidate((_, value) => value.shadowPath.delete());
    busy = false;
    return;
  }

  // Load information from the event
  const {
    awaitTimer, 
    computeTimer, 
    allItems, 
    metadata, 
    visionShapes, 
    playersWithVision, 
    invalidateCache, 
    visionRange,
  } = event.detail;

  let size = event.detail.size, offset = event.detail.offset, scale = event.detail.scale;
  let [width, height] = size;

  const autodetectEnabled = sceneCache.metadata[`${ID}/autodetectEnabled`] === true;
  if (autodetectEnabled) {
    // draw a big box around all the maps
    const maps = await OBR.scene.items.getItems((item) => item.layer === "MAP");
    
    let mapbox = [];
    for (let map of maps) {
      let dpiRatio = sceneCache.gridDpi / map.grid.dpi;
      let left = map.position.x, top = map.position.y;
      let right = (map.position.x + (dpiRatio * map.image.width)) * map.scale.x, bottom = (map.position.y +  (dpiRatio *map.image.height)) * map.scale.y;

      if (!mapbox.length) {
        mapbox[0] = left;
        mapbox[1] = top;
        mapbox[2] = right;
        mapbox[3] = bottom;
      } else {
        if (left < mapbox[0]) mapbox[0] = left;
        if (top < mapbox[1]) mapbox[1] = top;
        if (right > mapbox[2]) mapbox[2] = right;
        if (bottom > mapbox[3]) mapbox[3] = bottom;
      }
    }

    offset = [mapbox[0], mapbox[1]];
    size = [mapbox[2] - mapbox[0], mapbox[3] - mapbox[1]];
    scale = [1, 1];
    [width, height] = size;
  }

  let cacheHits = 0, cacheMisses = 0;
  if (invalidateCache)  // Something significant changed => invalidate cache
    playerShadowCache.invalidate((_, value) => value.shadowPath.delete());
  
  computeTimer.resume();
  
  const shouldComputeVision = metadata[`${ID}/visionEnabled`] === true;
  if (!shouldComputeVision || playersWithVision.length == 0) {
    // Clear fog
    const fogItems = await OBR.scene.items.getItems( (item) => item.name === "Fog of War" );
    await OBR.scene.local.deleteItems(fogItems.map(fogItem => fogItem.id));

    //await OBR.scene.local.deleteItems(localItems.filter(isVisionFog).map(fogItem => fogItem.id));
    busy = false;
    return;
  }
  
  // Extract all lines from the drawn shapes
  const visionLines = [];
  for (const shape of visionShapes) {
    for (let i = 0; i < shape.points.length-1; i++) {
      visionLines.push({
        startPosition: {x: (shape.points[i].x * shape.scale.x + shape.position.x), y: (shape.points[i].y * shape.scale.y + shape.position.y)},
        endPosition: {x: (shape.points[i+1].x * shape.scale.x + shape.position.x), y: (shape.points[i+1].y * shape.scale.y + shape.position.y)},
        originalShape: shape,
        oneSided: shape.metadata[`${ID}/oneSided`]
      });
    }
  }

  // `polygons` is a an array of arrays. Each element in the main array is
  // another array containing the individual shadows cast by a vision line
  // from the point of view of one player.
  const polygons = [];
  for (const player of playersWithVision) {
    const cacheResult = playerShadowCache.getValue(player.id);
    polygons.push([]);
    if (cacheResult !== undefined && comparePosition(cacheResult.player.position, player.position)) {
      continue; // The result is cached and will be used later, no need to do work
    }
    for (const line of visionLines) {
      const signedDistance = (player.position.x - line.startPosition.x) * (line.endPosition.y - line.startPosition.y) - (player.position.y - line.startPosition.y) * (line.endPosition.x - line.startPosition.x);
      if (line.oneSided !== undefined) {
        if ((line.oneSided == "right" && signedDistance > 0) || (line.oneSided == "left" && signedDistance < 0))
          continue;
      }
      
      // *1st step* - compute the points in the polygon representing the shadow
      // cast by `line` from the point of view of `player`.

      const v1 = {x: line.startPosition.x - player.position.x, y: line.startPosition.y - player.position.y};
      const v2 = {x: line.endPosition.x - player.position.x, y: line.endPosition.y - player.position.y};

      var proj1 = {x: 0, y: 0}, proj2 = {x: 0, y: 0};
      var xlim1 = 0, ylim1 = 0, xlim2 = 0, ylim2 = 0;

      // Make sure we don't go past the image borders
      //! This is probably not required if we later compute the intersection
      //! (using PathKit) of these polygons with a base rectangle the size of
      //! our background image
      if (v1.x < 0) xlim1 = offset[0] * scale[0];
      else xlim1 = (width + offset[0]) * scale[0];
      if (v1.y < 0) ylim1 = offset[1] * scale[1];
      else ylim1 = (height + offset[1]) * scale[1];
      if (v2.x < 0) xlim2 = offset[0] * scale[0];
      else xlim2 = (width + offset[0]) * scale[0];
      if (v2.y < 0) ylim2 = offset[1] * scale[1];
      else ylim2 = (height + offset[1]) * scale[1];
      
      const options1 = [], options2 = [];
      if (v1.x != 0) {
        const m = v1.y / v1.x;
        const b = line.startPosition.y - m * line.startPosition.x;
        options1.push({x: xlim1, y: m * xlim1 + b});
      }
      if (v1.y != 0) {
        const n = v1.x / v1.y;
        const c = n * line.startPosition.y - line.startPosition.x;
        options1.push({x: n * ylim1 - c, y: ylim1});
      }
      if (v2.x != 0) {
        const m = v2.y / v2.x;
        const b = line.endPosition.y - m * line.endPosition.x;
        options2.push({x: xlim2, y: m * xlim2 + b});
      }
      if (v2.y != 0) {
        const n = v2.x / v2.y;
        const c = n * line.endPosition.y - line.endPosition.x;
        options2.push({x: n * ylim2 - c, y: ylim2});
      }
      
      if (options1.length == 1 || squareDistance(options1[0], line.startPosition) < squareDistance(options1[1], line.startPosition))
        proj1 = options1[0];
      else
        proj1 = options1[1];
      
      if (options2.length == 1 || squareDistance(options2[0], line.endPosition) < squareDistance(options2[1], line.endPosition))
        proj2 = options2[0];
      else
        proj2 = options2[1];

      const pointset = [
        {x: line.startPosition.x, y: line.startPosition.y},
        proj1,
        proj2,
        {x: line.endPosition.x, y: line.endPosition.y},
      ];

      // Find out in which edge each solution lies
      const corners = [
        {x: (width + offset[0]) * scale[0], y: offset[1] * scale[1]},
        {x: (width + offset[0]) * scale[0], y: (height + offset[1]) * scale[1]},
        {x: offset[0] * scale[0], y: (height + offset[1]) * scale[1]},
        {x: offset[0] * scale[0], y: offset[1] * scale[1]}, 
      ];
      const edges = [0, 0];
      let i = 0;
      for (const proj of [proj1, proj2]) {
        if (isClose(proj.y, offset[1] * scale[1]))
          edges[i] = 0;
        else if (isClose(proj.y, (height + offset[1]) * scale[1]))
          edges[i] = 2;
        else if (isClose(proj.x, offset[0] * scale[0]))
          edges[i] = 3;
        else if (isClose(proj.x, (width + offset[0]) * scale[0]))
          edges[i] = 1;

        i++;
      }

      let direction = Math.sign(signedDistance);
      direction = direction == 0 ? 1 : -direction;
      const last = direction == 1 ? edges[1] : mod(edges[1]-1, 4);
      for (let k = edges[0] + (direction == 1 ? 0 : -1); mod(k, 4) != last; k += direction) {
        pointset.splice(pointset.length-2, 0, corners[mod(k, 4)]);
      }
      
      polygons[polygons.length-1].push({pointset: pointset, fromShape: line.originalShape});
    }
  }
  if (polygons.length == 0) {
    busy = false;
    return;
  }

  // *2nd step* - compute shadow polygons for each player, merging all polygons
  // created previously (this can probably be merged into the last step)
  const itemsPerPlayer = {};

  for (let j = 0; j < polygons.length; j++) {
    const player = playersWithVision[j];
    let cacheResult = playerShadowCache.getValue(player.id);
    if (cacheResult !== undefined && comparePosition(cacheResult.player.position, player.position)) {
      // The value is cached, use it
      itemsPerPlayer[j] = cacheResult.shadowPath.copy();
      cacheHits++;
      continue;
    }
    cacheMisses++;
    const playerPolygons = polygons[j];
    const pathBuilder = new PathKit.SkOpBuilder();
    const tempPath = PathKit.NewPath().rect(offset[0], offset[1], size[0], size[1]);
    pathBuilder.add(tempPath, PathKit.PathOp.UNION);
    tempPath.delete();

    // Merge all polygons
    for (const polygon of playerPolygons) {
      const shape = polygon.fromShape;
      const newPath = PathKit.NewPath();

      newPath.moveTo(polygon.pointset[0].x, polygon.pointset[0].y);
      for (let j = 1; j < polygon.pointset.length; j++) {
        newPath.lineTo(polygon.pointset[j].x, polygon.pointset[j].y);
      }

      if (shape.style.closed != false) {
        const shapePath = PathKit.NewPath();
        shapePath.moveTo(shape.points[0].x * shape.scale.x + shape.position.x, shape.points[0].y * shape.scale.y + shape.position.y);
        //for (let i = shape.points.length-1; i < 1; i--)
        for (let i = 1; i < shape.points.length-1; i++)
          shapePath.lineTo(shape.points[i].x * shape.scale.x + shape.position.x, shape.points[i].y * shape.scale.y + shape.position.y);
        newPath.op(shapePath, PathKit.PathOp.DIFFERENCE);
        shapePath.delete();
      }
      //newPath.simplify();
      pathBuilder.add(newPath, PathKit.PathOp.DIFFERENCE);
      newPath.delete();
    }
    const path = pathBuilder.resolve();

    if (!path || path.toCmds().length == 0) {
      console.error("Couldn't compute fog");
      busy = false;
      return;
    }

    pathBuilder.delete();

    if (path !== undefined) {
      path.simplify();
      itemsPerPlayer[j] = path;
      let cacheResult = playerShadowCache.getValue(player.id);
      if (cacheResult !== undefined) {
        cacheResult.shadowPath.delete();
      }
      // Cache the computed path for future use
      playerShadowCache.cacheValue(player.id, {shadowPath: path.copy(), player: player});
    }
  }

  // *3rd step* - compute vision ranges
    // Create vision circles that cut each player's fog
  for (let i = 0; i < playersWithVision.length; i++) {
    const player = playersWithVision[i];
    const visionRangeMeta = player.metadata[`${ID}/visionRange`];
    if (visionRangeMeta) {
      const visionRange = sceneCache.gridDpi * (visionRangeMeta / sceneCache.gridScale + .5);
      const ellipse = PathKit.NewPath().ellipse(player.position.x, player.position.y, visionRange, visionRange, 0, 0, 2*Math.PI);
      itemsPerPlayer[i].op(ellipse, PathKit.PathOp.INTERSECT);
      ellipse.delete();
    }
  }

  const itemsToAdd = [];
  const persistenceEnabled = sceneCache.metadata[`${ID}/persistenceEnabled`] === true;
  const fowEnabled = sceneCache.metadata[`${ID}/fowEnabled`] === true;
  let megapathrect;
  const dedup_digest = {};

  if (fowEnabled) {
    // Create a rect (around our fog area, needs autodetection or something), which we then carve out based on the path showing the currently visible area
    megapathrect = PathKit.NewPath().rect(offset[0], offset[0], size[0], size[1]);
  }

  for (const key of Object.keys(itemsPerPlayer)) {
    const item = itemsPerPlayer[key];

    // TODO: how slow is this? is there a more efficient way?
    const encoder = new TextEncoder();
    const data = encoder.encode(item.toCmds().toString());

    const digest = await crypto.subtle.digest("SHA-1", data).then(hash => {
      return ([...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join(''));
    });

    const dedup = await OBR.scene.items.getItems(filter_item => { return filter_item.metadata[`${ID}/digest`] === digest });

    if (dedup.length === 0) {
      itemsToAdd.push({cmds: item.toCmds(), visible: false, zIndex: 3, playerId: playersWithVision[key].id, digest: digest});
    } else {
      // these duplicates are still visible, so dont delete them if we have persistence turned off.
      dedup_digest[digest] = true;
    }

    if (fowEnabled) {
      megapathrect.op(item, PathKit.PathOp.DIFFERENCE);
    }
    item.delete();
  }

  const old_megafog = await OBR.scene.local.getItems();

  computeTimer.pause(); awaitTimer.resume();

  if (fowEnabled) {
    const fowColor = sceneCache.metadata[`${ID}/fowColor`] ? sceneCache.metadata[`${ID}/fowColor`] : "#000000";
    const megapath = buildPath().commands(megapathrect.toCmds()).locked(true).fillRule("evenodd").visible(true).fillColor(fowColor).fillOpacity(0.5).strokeWidth(0).strokeColor("#000000").layer("DRAWING").name("Megafog").build();
    megapath.zIndex = 0;
    
    if (old_megafog.length > 0) {
      // If the old item exists in the scene, reuse it, otherwise you get flickering. 
      // Warning: This can use fastUpdate since we only change the path, though it seemed to break without it too.
      OBR.scene.local.updateItems(filter_item => { return filter_item.name === "Megafog" }, items => {
        for (const item of items) {
          item.commands = megapath.commands;
        }
      }, true);
    } else {
      await OBR.scene.local.addItems([megapath]);
    }
  
    megapathrect.delete();
  } else {
    const fogItems = await OBR.scene.local.getItems(filter_item => { return filter_item.name === "Megafog" });
    await OBR.scene.local.deleteItems(fogItems.map(fogItem => fogItem.id));
  }

  // Before we start adding and removing, get a list of fog items, excluding any that we detected as duplicates in the scene:
  const oldFog = await OBR.scene.items.getItems( (item) => item.name === "Fog of War" && dedup_digest[item.metadata[`${ID}/digest`]] === undefined );

  const promisesToExecute = [
    OBR.scene.items.addItems(itemsToAdd.map(item => {

      const FOGPLAYERID = item.playerId;

      const path = buildPath().commands(item.cmds).locked(true).visible(item.visible).fillColor('#000000').strokeColor("#000000").layer("FOG").name("Fog of War").metadata({[`${ID}/isVisionFog`]: true}).metadata({[`${ID}/${FOGPLAYERID}`]: true}).metadata({[`${ID}/digest`]: item.digest}).build();
      path.zIndex = item.zIndex;

      return path;
    }))
  ];

  if (!persistenceEnabled) {
    // these deletes control persistence.
    // in path merge mode, remove the previous item, because we have replaced it with our new one.
    promisesToExecute.push(OBR.scene.items.deleteItems(oldFog.map((item) => item.id)));

    // in the original, it just wipes out everything in scene.local
    //OBR.scene.local.deleteItems(localItems.filter(isVisionFog).map(fogItem => fogItem.id)),
  }

  if (!sceneCache.fog.filled)
    promisesToExecute.push(OBR.scene.fog.setFilled(true));

  // Update all items
  await Promise.all(promisesToExecute);

  const [awaitTimerResult, computeTimerResult] = [awaitTimer.stop(), computeTimer.stop()];
  updatePerformanceInformation({
    "compute_time": `${computeTimerResult} ms`, 
    "communication_time": `${awaitTimerResult} ms`, 
    "cache_hits": cacheHits,
    "cache_misses": cacheMisses,
  });

  busy = false;
}
document.addEventListener("updateVision", computeShadow)

var previousVisionShapes, previousPlayersWithVision, previousSize, previousVisionEnabled, previousAutodetectEnabled, previousFowEnabled, previousPersistenceEnabled, previousMap, previousFowColor;
export async function onSceneDataChange(forceUpdate) {
  if (busy)
    return;

  if (!(await OBR.scene.isReady()))
    return;

  const [awaitTimer, computeTimer] = [new Timer(), new Timer()];
  
  awaitTimer.start(); awaitTimer.pause();
  computeTimer.start();

  const playersWithVision = sceneCache.items.filter(isPlayerWithVision);
  const visionShapes = sceneCache.items.filter(isActiveVisionLine);
  const backgroundImage = sceneCache.items.filter(isBackgroundImage)?.[0];
  const visionEnabled = sceneCache.metadata[`${ID}/visionEnabled`] === true;
  const persistenceEnabled = sceneCache.metadata[`${ID}/persistenceEnabled`] === true;
  const autodetectEnabled = sceneCache.metadata[`${ID}/autodetectEnabled`] === true;
  const fowEnabled = sceneCache.metadata[`${ID}/fowEnabled`] === true;
  const fowColor = sceneCache.metadata[`${ID}/fowColor`];

  if (backgroundImage === undefined)
    return;

  const dpiRatio = sceneCache.gridDpi / backgroundImage.grid.dpi;
  const size = [backgroundImage.image.width * dpiRatio, backgroundImage.image.height * dpiRatio];
  const scale = [backgroundImage.scale.x, backgroundImage.scale.y];
  const offset = [backgroundImage.position.x, backgroundImage.position.y];
  document.getElementById("map_name").innerText = backgroundImage.name;
  document.getElementById("map_size").innerText = `Map size: ${Math.round(size[0])}x${Math.round(size[1])} px`;

  // Check if any values have changed and a re-draw is necessary
  const sVisionShapes = JSON.stringify(visionShapes);
  const sPlayersWithVision = JSON.stringify(playersWithVision);
  const sBackgroundImage = JSON.stringify(backgroundImage);
  if (sBackgroundImage == previousMap 
    && visionEnabled == previousVisionEnabled 
    && previousFowColor == fowColor
    && previousAutodetectEnabled == autodetectEnabled
    && previousFowEnabled == fowEnabled
    && previousPersistenceEnabled == persistenceEnabled
    && previousVisionShapes == sVisionShapes 
    && previousPlayersWithVision == sPlayersWithVision 
    && size[0] == previousSize[0] 
    && size[1] == previousSize[1]
    && forceUpdate !== true)
    return;

  // Check if the cache needs to be invalidated
  let invalidateCache = false;
  if (sBackgroundImage != previousMap || previousVisionShapes != sVisionShapes || size[0] != previousSize[0] || size[1] != previousSize[1])
    invalidateCache = true;

  previousMap = sBackgroundImage;
  previousPlayersWithVision = sPlayersWithVision;
  previousVisionShapes = sVisionShapes;
  previousSize = size;
  previousVisionEnabled = visionEnabled;
  previousAutodetectEnabled = autodetectEnabled;
  previousFowEnabled = fowEnabled;
  previousFowColor = fowColor;
  previousPersistenceEnabled = persistenceEnabled;
  computeTimer.pause();

  // Fire an `updateVisionEvent` to launch the `computeShadow` function.
  const updateVisionEvent = new CustomEvent("updateVision", {
    detail: {
      awaitTimer: awaitTimer,
      computeTimer: computeTimer,
      allItems: sceneCache.items,
      metadata: sceneCache.metadata,
      size: size,
      offset: offset,
      scale: scale,
      playersWithVision: playersWithVision,
      visionShapes: visionShapes,
      invalidateCache: invalidateCache,
    }
  });

  if (!busy) {
    document.dispatchEvent(updateVisionEvent);
  }
}
