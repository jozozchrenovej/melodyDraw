
const CANVAS_BG = [220, 235, 250];

let osc;
let drawingData = [];
let isDrawing = false;
let showGuide = false;
let currentMelody = [];
const MELODY_PATTERNS = [
  // Linear up
  Array.from({length: 11}, (_, i) => 100 + i * 50),
  // Linear down
  Array.from({length: 11}, (_, i) => 600 - i * 50),
  // Up then down (triangle)
  [100, 150, 200, 250, 300, 350, 300, 250, 200, 150, 100],
  // Down then up (inverse triangle)
  [600, 550, 500, 450, 400, 350, 400, 450, 500, 550, 600]
];

function setup() {
  let canvas = createCanvas(400, 400);
  canvas.parent('canvas-container');
  background(...CANVAS_BG);

  osc = new Tone.Oscillator(240, "square").toDestination();
  osc.volume.value = -16;

  // Mouse events for drawing
  canvas.elt.addEventListener('mousedown', (evt) => {
    isDrawing = true;
    drawingData = [];
  });

  canvas.elt.addEventListener('mousemove', (evt) => {
    if (isDrawing) {
      let mousePos = getMousePos(canvas.elt, evt);
      drawingData.push(mousePos.y);
      stroke(60, 60, 120);
      strokeWeight(3);
      line(mousePos.x, mousePos.y, pmouseX, pmouseY);
      // Play pitch feedback
      let freq_calculated = map(mousePos.y, height, 0, 100, 600);
      osc.frequency.value = freq_calculated;
      if (Tone.context.state !== 'running') Tone.context.resume();
      if (!osc.state || osc.state === 'stopped') osc.start();
    }
  });

  canvas.elt.addEventListener('mouseup', () => {
    isDrawing = false;
    if (osc.state === 'started') osc.stop();
  });

  // Button events
  document.getElementById('playMelody').onclick = playMelody;
  document.getElementById('evaluateDrawing').onclick = evaluateDrawing;
  document.getElementById('clearCanvas').onclick = clearCanvas;
  document.getElementById('toggleGuide').onclick = toggleGuideFn;

  drawMelodyGuide();
}

function draw() {
  // Redraw guide if toggled
  if (showGuide) {
    drawMelodyGuide();
  }
}

function getMousePos(canvas, evt) {
  let rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function playMelody() {
  // Pick random melody
  const idx = Math.floor(Math.random() * MELODY_PATTERNS.length);
  currentMelody = MELODY_PATTERNS[idx];

  let index = 0;
  function playNextNote() {
    if (index < currentMelody.length) {
      let freq = currentMelody[index];
      osc.frequency.rampTo(freq, 0.1);
      if (Tone.context.state !== 'running') Tone.context.resume();
      osc.start();
      setTimeout(() => {
        osc.stop();
        index++;
        playNextNote();
      }, 300);
    }
  }
  playNextNote();
  clearCanvas();
  if (showGuide) drawMelodyGuide();
}

function evaluateDrawing() {
  if (!currentMelody.length) {
    document.getElementById("result").innerText = "Play melody first!";
    return;
  }
  if (drawingData.length === 0) {
    document.getElementById("result").innerText = "Draw something first!";
    return;
  }
  let normalizedMelody = normalizeArray(currentMelody);
  let flippedDrawing = drawingData.map(y => height - y);
  let normalizedDrawing = normalizeArray(flippedDrawing);
  let smoothedDrawing = smoothArray(normalizedDrawing, 2);
  let resampledDrawing = resampleArray(smoothedDrawing, normalizedMelody.length);

  let { dtwDistance } = dtw(normalizedMelody, resampledDrawing);
  let maxPossibleCost = normalizedMelody.length;
  let finalDTW = dtwDistance / (maxPossibleCost + 0.0001);
  let threshold = 0.1;
  let resultText = finalDTW < threshold ? "Good match! ✅" : "Try again ❌";
  document.getElementById("result").innerText = `DTW Score: ${finalDTW.toFixed(3)} - ${resultText}`;
}

function clearCanvas() {
  background(...CANVAS_BG);
  drawingData = [];
  document.getElementById("result").innerText = "";
  if (showGuide) drawMelodyGuide();
}

function toggleGuideFn() {
  showGuide = !showGuide;
  clearCanvas();
  if (showGuide && currentMelody.length) drawMelodyGuide();
}

function drawMelodyGuide() {
  if (!showGuide || !currentMelody.length) return;
  stroke(0, 180, 70, 180);
  strokeWeight(3);
  noFill();
  let scaledMelody = scaleMelodyToCanvas(currentMelody);
  beginShape();
  for (let i = 0; i < scaledMelody.length; i++) {
    let x = map(i, 0, scaledMelody.length - 1, 50, width - 50);
    let y = scaledMelody[i];
    vertex(x, y);
  }
  endShape();
}

// Utility functions
function scaleMelodyToCanvas(melodyArr) {
  let minM = Math.min(...melodyArr);
  let maxM = Math.max(...melodyArr);
  return melodyArr.map(value => map(value, minM, maxM, height - 50, 50));
}

function normalizeArray(arr) {
  let minVal = Math.min(...arr);
  let maxVal = Math.max(...arr);
  if (maxVal === minVal) return arr.map(() => 0);
  return arr.map(value => (value - minVal) / (maxVal - minVal));
}

function smoothArray(arr, windowSize) {
  return arr.map((val, idx, array) => {
    let start = Math.max(0, idx - Math.floor(windowSize / 2));
    let end = Math.min(array.length - 1, idx + Math.floor(windowSize / 2));
    let subset = array.slice(start, end + 1);
    return subset.reduce((sum, v) => sum + v, 0) / subset.length;
  });
}

function resampleArray(arr, targetLength) {
  let step = arr.length / targetLength;
  return Array.from({ length: targetLength }, (_, i) => arr[Math.floor(i * step)]);
}

function dtw(seq1, seq2) {
  let n = seq1.length;
  let m = seq2.length;
  let costMatrix = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  costMatrix[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(seq1[i - 1] - seq2[j - 1]);
      costMatrix[i][j] =
        cost +
        Math.min(
          costMatrix[i - 1][j], // Insertion
          costMatrix[i][j - 1], // Deletion
          costMatrix[i - 1][j - 1] // Match
        );
    }
  }
  return { dtwDistance: costMatrix[n][m], dtwMatrix: costMatrix };
}
