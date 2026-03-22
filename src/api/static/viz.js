// Timetable Generator — D3.js Visualization
// Fixes: form/json sync, validation, node click, mobile, empty states, URL hash, localStorage

const COLORS = [
    '#58a6ff','#f78166','#3fb950','#d2a8ff','#f0883e',
    '#79c0ff','#ffa657','#56d364','#bc8cff','#e3b341',
    '#ff7b72','#7ee787','#a5d6ff','#d29922','#db61a2',
    '#7dc4e4','#f2cc60','#8b949e','#388bfd','#ea6045'
];
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const HOURS = [
    {hour:8,label:"8 AM"},{hour:9,label:"9 AM"},{hour:10,label:"10 AM"},
    {hour:11,label:"11 AM"},{hour:12,label:"12 PM"},{hour:13,label:"1 PM"},
    {hour:14,label:"2 PM"},{hour:15,label:"3 PM"},{hour:16,label:"4 PM"},
    {hour:17,label:"5 PM"}
];

// ─── State ──────────────────────────────────────────────────────────────────
let formData = { teachers:[], student_groups:[], rooms:[], courses:[], timeslots:new Set() };
let state = { inputData:null, result:null, graphData:null };
let idCounters = { teacher:1, group:1, room:1, course:1, section:1 };

function plural(n, word) { return n === 1 ? `${n} ${word}` : `${n} ${word}s`; }

// ─── Error Banner ───────────────────────────────────────────────────────────
function showError(msg) {
    const el = document.getElementById('error-banner');
    el.textContent = msg;
    el.classList.add('visible');
}
function hideError() {
    document.getElementById('error-banner').classList.remove('visible');
}

// ─── Tab Switching with URL hash ────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
}

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (['input','graph','solver','timetable','submissions'].includes(h)) switchTab(h);
});

// Restore tab from URL on load
const initHash = location.hash.slice(1);
if (['graph','solver','timetable','submissions'].includes(initHash)) switchTab(initHash);

// ─── Accordion toggles ─────────────────────────────────────────────────────
document.querySelectorAll('.entity-header').forEach(header => {
    header.addEventListener('click', () => {
        header.classList.toggle('open');
        document.getElementById('body-' + header.dataset.section).classList.toggle('open');
    });
});

// ─── Mode Toggle (Form ↔ JSON sync) ────────────────────────────────────────
document.getElementById('mode-form').addEventListener('click', () => {
    document.getElementById('mode-form').classList.add('active');
    document.getElementById('mode-json').classList.remove('active');
    document.getElementById('form-mode').style.display = '';
    document.getElementById('json-mode').style.display = 'none';
    // Sync JSON → form (if user edited JSON)
    try {
        const json = document.getElementById('input-json').value;
        if (json.trim()) loadFormFromJSON(JSON.parse(json));
    } catch(_) { /* ignore parse errors when switching back */ }
});

document.getElementById('mode-json').addEventListener('click', () => {
    document.getElementById('mode-json').classList.add('active');
    document.getElementById('mode-form').classList.remove('active');
    document.getElementById('form-mode').style.display = 'none';
    document.getElementById('json-mode').style.display = '';
    // Sync form → JSON
    document.getElementById('input-json').value = JSON.stringify(buildInputFromForm(), null, 2);
});

// ─── Timeslot Grid (with drag-to-paint + header clicks) ─────────────────────
let tsDragging = false;
let tsBrushOn = true; // true = add slots, false = remove slots

function renderTimeslotGrid() {
    const grid = document.getElementById('timeslot-grid');
    let html = '<div class="ts-header"></div>';
    DAYS.forEach(d => { html += `<div class="ts-header ts-hdr-click" data-day="${d}" style="cursor:pointer">${d.slice(0,3)}</div>`; });
    HOURS.forEach((h, pi) => {
        html += `<div class="ts-header ts-hdr-click" data-hour="${pi+1}" style="cursor:pointer">${h.label}</div>`;
        DAYS.forEach(day => {
            const key = `${day}-${pi+1}`;
            const active = formData.timeslots.has(key);
            html += `<div class="ts-cell ${active?'active':''}" data-ts="${key}">${active?'&#10003;':''}</div>`;
        });
    });
    grid.innerHTML = html;
}

function tsSetCell(cell, on) {
    const key = cell.dataset.ts;
    if (!key) return;
    if (on) { formData.timeslots.add(key); cell.classList.add('active'); cell.innerHTML='&#10003;'; }
    else { formData.timeslots.delete(key); cell.classList.remove('active'); cell.innerHTML=''; }
}

const tsGrid = document.getElementById('timeslot-grid');

// Drag to paint/erase
tsGrid.addEventListener('mousedown', e => {
    const cell = e.target.closest('.ts-cell');
    if (!cell) return;
    tsDragging = true;
    tsBrushOn = !formData.timeslots.has(cell.dataset.ts); // toggle: if was on, we erase; if off, we paint
    tsSetCell(cell, tsBrushOn);
    updateSummary();
    e.preventDefault();
});
tsGrid.addEventListener('mouseover', e => {
    if (!tsDragging) return;
    const cell = e.target.closest('.ts-cell');
    if (cell) { tsSetCell(cell, tsBrushOn); updateSummary(); }
});
document.addEventListener('mouseup', () => { tsDragging = false; });

// Touch support
tsGrid.addEventListener('touchstart', e => {
    const cell = e.target.closest('.ts-cell');
    if (!cell) return;
    tsDragging = true;
    tsBrushOn = !formData.timeslots.has(cell.dataset.ts);
    tsSetCell(cell, tsBrushOn);
    updateSummary();
    e.preventDefault();
}, {passive:false});
tsGrid.addEventListener('touchmove', e => {
    if (!tsDragging) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = el?.closest?.('.ts-cell');
    if (cell && tsGrid.contains(cell)) { tsSetCell(cell, tsBrushOn); updateSummary(); }
    e.preventDefault();
}, {passive:false});
document.addEventListener('touchend', () => { tsDragging = false; });

// Click day/hour headers to toggle entire column/row
tsGrid.addEventListener('click', e => {
    const hdr = e.target.closest('.ts-hdr-click');
    if (hdr) {
        if (hdr.dataset.day) {
            const day = hdr.dataset.day;
            // Toggle: if all are on, turn off; otherwise turn on
            const allOn = HOURS.every((_,pi) => formData.timeslots.has(`${day}-${pi+1}`));
            HOURS.forEach((_,pi) => { const k=`${day}-${pi+1}`; if(allOn) formData.timeslots.delete(k); else formData.timeslots.add(k); });
        } else if (hdr.dataset.hour) {
            const period = hdr.dataset.hour;
            const allOn = DAYS.every(d => formData.timeslots.has(`${d}-${period}`));
            DAYS.forEach(d => { const k=`${d}-${period}`; if(allOn) formData.timeslots.delete(k); else formData.timeslots.add(k); });
        }
        renderTimeslotGrid();
        updateSummary();
        return;
    }
    // Single click fallback (if not dragging)
    const cell = e.target.closest('.ts-cell');
    if (cell && !tsDragging) {
        tsSetCell(cell, !formData.timeslots.has(cell.dataset.ts));
        updateSummary();
    }
});

document.getElementById('btn-ts-all').addEventListener('click', () => {
    HOURS.forEach((_,pi) => DAYS.forEach(d => formData.timeslots.add(`${d}-${pi+1}`)));
    renderTimeslotGrid(); updateSummary();
});
document.getElementById('btn-ts-weekdays').addEventListener('click', () => {
    formData.timeslots.clear();
    HOURS.forEach((h,pi) => {
        if (h.hour >= 9 && h.hour <= 15) DAYS.slice(0,5).forEach(d => formData.timeslots.add(`${d}-${pi+1}`));
    });
    renderTimeslotGrid(); updateSummary();
});
document.getElementById('btn-ts-clear').addEventListener('click', () => {
    formData.timeslots.clear(); renderTimeslotGrid(); updateSummary();
});

// ─── Entity Rendering ───────────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderTeachers() {
    document.getElementById('list-teachers').innerHTML = formData.teachers.map((t,i) => `<div class="entity-card">
        <button class="remove-btn" data-remove="teacher" data-idx="${i}">&times;</button>
        <div class="card-row">
            <div class="form-group"><label>ID</label><input type="text" value="${esc(t.teacher_id)}" data-field="teacher_id" data-type="teacher" data-idx="${i}" required /></div>
            <div class="form-group"><label>Name</label><input type="text" value="${esc(t.name)}" data-field="name" data-type="teacher" data-idx="${i}" required /></div>
            <div class="form-group"><label>Max hrs/week</label><input type="number" value="${t.max_hours_per_week||20}" min="1" max="168" data-field="max_hours_per_week" data-type="teacher" data-idx="${i}" /></div>
        </div>
    </div>`).join('');
    document.getElementById('count-teachers').textContent = formData.teachers.length;
}

function renderGroups() {
    document.getElementById('list-groups').innerHTML = formData.student_groups.map((g,i) => `<div class="entity-card">
        <button class="remove-btn" data-remove="group" data-idx="${i}">&times;</button>
        <div class="card-row">
            <div class="form-group"><label>ID</label><input type="text" value="${esc(g.group_id)}" data-field="group_id" data-type="group" data-idx="${i}" required /></div>
            <div class="form-group"><label>Name</label><input type="text" value="${esc(g.name)}" data-field="name" data-type="group" data-idx="${i}" required /></div>
            <div class="form-group"><label>Size</label><input type="number" value="${g.size}" min="1" data-field="size" data-type="group" data-idx="${i}" /></div>
        </div>
    </div>`).join('');
    document.getElementById('count-groups').textContent = formData.student_groups.length;
}

function renderRooms() {
    document.getElementById('list-rooms').innerHTML = formData.rooms.map((r,i) => `<div class="entity-card">
        <button class="remove-btn" data-remove="room" data-idx="${i}">&times;</button>
        <div class="card-row">
            <div class="form-group"><label>ID</label><input type="text" value="${esc(r.room_id)}" data-field="room_id" data-type="room" data-idx="${i}" required /></div>
            <div class="form-group"><label>Name</label><input type="text" value="${esc(r.name)}" data-field="name" data-type="room" data-idx="${i}" required /></div>
            <div class="form-group"><label>Capacity</label><input type="number" value="${r.capacity}" min="1" data-field="capacity" data-type="room" data-idx="${i}" /></div>
            <div class="form-group"><label>Type</label>
                <select data-field="room_type" data-type="room" data-idx="${i}">
                    <option value="lecture" ${r.room_type!=='lab'?'selected':''}>Lecture</option>
                    <option value="lab" ${r.room_type==='lab'?'selected':''}>Lab</option>
                </select>
            </div>
        </div>
    </div>`).join('');
    document.getElementById('count-rooms').textContent = formData.rooms.length;
}

function renderCourses() {
    document.getElementById('list-courses').innerHTML = formData.courses.map((c,ci) => {
        const secs = (c.sections||[]).map((s,si) => {
            const tOpts = formData.teachers.map(t =>
                `<option value="${esc(t.teacher_id)}" ${s.teacher_id===t.teacher_id?'selected':''}>${esc(t.name)} (${esc(t.teacher_id)})</option>`).join('');
            const chips = formData.student_groups.map(g =>
                `<span class="chip ${(s.student_group_ids||[]).includes(g.group_id)?'selected':''}" data-course="${ci}" data-section="${si}" data-gid="${esc(g.group_id)}">${esc(g.name)}</span>`).join('');
            return `<div style="background:#0d1117;border-radius:6px;padding:10px;margin-top:8px;position:relative;">
                <button class="remove-btn" data-remove="section" data-ci="${ci}" data-si="${si}" style="top:4px;right:4px;">&times;</button>
                <div class="card-row" style="margin-bottom:8px;">
                    <div class="form-group"><label>Section ID</label><input type="text" value="${esc(s.section_id)}" data-field="section_id" data-type="section" data-ci="${ci}" data-si="${si}" /></div>
                    <div class="form-group"><label>Lectures/week</label><input type="number" value="${s.lectures_per_week}" min="1" max="7" data-field="lectures_per_week" data-type="section" data-ci="${ci}" data-si="${si}" /></div>
                    <div class="form-group"><label>Teacher</label><select data-field="teacher_id" data-type="section" data-ci="${ci}" data-si="${si}"><option value="">Select...</option>${tOpts}</select></div>
                    <div class="form-group"><label>Max students</label><input type="number" value="${s.max_students||60}" min="1" data-field="max_students" data-type="section" data-ci="${ci}" data-si="${si}" /></div>
                </div>
                <div class="form-group"><label>Student Groups</label><div class="chip-group">${chips}</div></div>
            </div>`;
        }).join('');
        return `<div class="entity-card">
            <button class="remove-btn" data-remove="course" data-idx="${ci}">&times;</button>
            <div class="card-row" style="margin-bottom:8px;">
                <div class="form-group"><label>Course ID</label><input type="text" value="${esc(c.course_id)}" data-field="course_id" data-type="course" data-idx="${ci}" /></div>
                <div class="form-group"><label>Course Name</label><input type="text" value="${esc(c.name)}" data-field="name" data-type="course" data-idx="${ci}" /></div>
            </div>
            <div style="font-size:12px;color:#8b949e;margin-bottom:4px;">Sections</div>
            ${secs}
            <div class="add-row" data-add="section" data-ci="${ci}" style="margin-top:8px;font-size:12px;">+ Add Section</div>
        </div>`;
    }).join('');
    document.getElementById('count-courses').textContent = formData.courses.length;
}

function renderAll() { renderTeachers(); renderGroups(); renderRooms(); renderCourses(); renderTimeslotGrid(); updateSummary(); }

function updateSummary() {
    const totalEvents = formData.courses.reduce((s,c) => s + (c.sections||[]).reduce((s2,sec) => s2+(sec.lectures_per_week||0),0),0);
    document.getElementById('summary-bar').innerHTML =
        `<div class="summary-item"><strong>${formData.teachers.length}</strong> Teachers</div>` +
        `<div class="summary-item"><strong>${formData.student_groups.length}</strong> Groups</div>` +
        `<div class="summary-item"><strong>${formData.rooms.length}</strong> Rooms</div>` +
        `<div class="summary-item"><strong>${formData.courses.length}</strong> Courses</div>` +
        `<div class="summary-item"><strong>${totalEvents}</strong> Events</div>` +
        `<div class="summary-item"><strong>${formData.timeslots.size}</strong> Timeslots</div>`;
    document.getElementById('count-timeslots').textContent = formData.timeslots.size;
}

// ─── Event Delegation on #form-mode ─────────────────────────────────────────
document.getElementById('form-mode').addEventListener('click', function(e) {
    const rem = e.target.closest('.remove-btn');
    if (rem) {
        e.stopPropagation();
        const t = rem.dataset.remove;
        if (t==='teacher') { formData.teachers.splice(rem.dataset.idx,1); renderTeachers(); renderCourses(); }
        else if (t==='group') { formData.student_groups.splice(rem.dataset.idx,1); renderGroups(); renderCourses(); }
        else if (t==='room') { formData.rooms.splice(rem.dataset.idx,1); renderRooms(); }
        else if (t==='course') { formData.courses.splice(rem.dataset.idx,1); renderCourses(); }
        else if (t==='section') { formData.courses[rem.dataset.ci].sections.splice(rem.dataset.si,1); renderCourses(); }
        updateSummary(); return;
    }
    const add = e.target.closest('.add-row');
    if (add) {
        const t = add.dataset.add;
        if (t==='teacher') { formData.teachers.push({teacher_id:'T'+idCounters.teacher++,name:'',max_hours_per_week:20}); renderTeachers(); renderCourses(); }
        else if (t==='group') { formData.student_groups.push({group_id:'G'+idCounters.group++,name:'',size:30}); renderGroups(); renderCourses(); }
        else if (t==='room') { formData.rooms.push({room_id:'R'+idCounters.room++,name:'',capacity:40,room_type:'lecture'}); renderRooms(); }
        else if (t==='course') { formData.courses.push({course_id:'C'+idCounters.course++,name:'',sections:[]}); renderCourses(); }
        else if (t==='section') {
            const c = formData.courses[add.dataset.ci];
            c.sections.push({section_id:c.course_id+'-'+String.fromCharCode(65+(c.sections||[]).length),course_id:c.course_id,lectures_per_week:3,teacher_id:'',student_group_ids:[],max_students:60});
            renderCourses();
        }
        updateSummary(); return;
    }
    const chip = e.target.closest('.chip[data-gid]');
    if (chip) {
        const sec = formData.courses[chip.dataset.course].sections[chip.dataset.section];
        const idx = sec.student_group_ids.indexOf(chip.dataset.gid);
        if (idx >= 0) { sec.student_group_ids.splice(idx,1); chip.classList.remove('selected'); }
        else { sec.student_group_ids.push(chip.dataset.gid); chip.classList.add('selected'); }
    }
});

document.getElementById('form-mode').addEventListener('change', function(e) {
    const el = e.target;
    if (!el.dataset.type || !el.dataset.field) return;
    let val = el.value;
    if (el.type === 'number') { val = Math.max(parseInt(val)||0, parseInt(el.min)||0); el.value = val; }
    const t = el.dataset.type, f = el.dataset.field;
    if (t==='teacher') { formData.teachers[el.dataset.idx][f] = val; renderCourses(); }
    else if (t==='group') { formData.student_groups[el.dataset.idx][f] = val; renderCourses(); }
    else if (t==='room') formData.rooms[el.dataset.idx][f] = val;
    else if (t==='course') formData.courses[el.dataset.idx][f] = val;
    else if (t==='section') formData.courses[el.dataset.ci].sections[el.dataset.si][f] = val;
    updateSummary();
});

// ─── Build Input JSON from Form ─────────────────────────────────────────────
function buildInputFromForm() {
    const timeslots = [];
    formData.timeslots.forEach(key => {
        const [day, ps] = key.split('-');
        const p = parseInt(ps);
        timeslots.push({day, period:p, start_hour:HOURS[p-1]?.hour||(7+p), start_minute:0, duration_minutes:60});
    });
    const sections = [];
    formData.courses.forEach(c => (c.sections||[]).forEach(s => {
        sections.push({section_id:s.section_id,course_id:c.course_id,lectures_per_week:s.lectures_per_week,teacher_id:s.teacher_id,student_group_ids:s.student_group_ids||[],max_students:s.max_students||60});
    }));
    return {
        courses: formData.courses.map(c => ({course_id:c.course_id,name:c.name,prerequisites:c.prerequisites||[]})),
        sections,
        teachers: formData.teachers.map(t => ({teacher_id:t.teacher_id,name:t.name})),
        student_groups: formData.student_groups.map(g => ({group_id:g.group_id,name:g.name,size:g.size})),
        rooms: formData.rooms.map(r => ({room_id:r.room_id,name:r.name,capacity:r.capacity,room_type:r.room_type||'lecture'})),
        timeslots,
        preferences: []
    };
}

// ─── Load form data from parsed JSON ────────────────────────────────────────
function loadFormFromJSON(data) {
    formData.teachers = (data.teachers||[]).map(t => ({teacher_id:t.teacher_id,name:t.name,max_hours_per_week:t.max_hours_per_week||20}));
    formData.student_groups = (data.student_groups||[]).map(g => ({group_id:g.group_id,name:g.name,size:g.size||30}));
    formData.rooms = (data.rooms||[]).map(r => ({room_id:r.room_id,name:r.name,capacity:r.capacity||40,room_type:r.room_type||'lecture'}));

    // Reconstruct courses with embedded sections
    const secByCourse = {};
    (data.sections||[]).forEach(s => { (secByCourse[s.course_id] = secByCourse[s.course_id]||[]).push(s); });
    formData.courses = (data.courses||[]).map(c => ({
        course_id:c.course_id, name:c.name, prerequisites:c.prerequisites||[],
        sections: (secByCourse[c.course_id]||[]).map(s => ({
            section_id:s.section_id, course_id:s.course_id, lectures_per_week:s.lectures_per_week||3,
            teacher_id:s.teacher_id||'', student_group_ids:s.student_group_ids||[], max_students:s.max_students||60
        }))
    }));

    formData.timeslots.clear();
    (data.timeslots||[]).forEach(ts => {
        const dayName = typeof ts.day === 'string' ? ts.day : '';
        if (dayName && ts.period) formData.timeslots.add(`${dayName}-${ts.period}`);
    });

    // Update ID counters
    const maxNum = (arr, prefix) => arr.reduce((m,x) => { const n=parseInt((x.match(/\d+$/)||['0'])[0]); return n>m?n:m; }, 0);
    idCounters.teacher = maxNum(formData.teachers.map(t=>t.teacher_id),'T') + 1;
    idCounters.group = maxNum(formData.student_groups.map(g=>g.group_id),'G') + 1;
    idCounters.room = maxNum(formData.rooms.map(r=>r.room_id),'R') + 1;
    idCounters.course = maxNum(formData.courses.map(c=>c.course_id),'C') + 1;

    renderAll();
}

// ─── Validation ─────────────────────────────────────────────────────────────
function validateInput(data) {
    const errors = [];
    if (!data.sections || data.sections.length === 0) errors.push('Add at least one course with a section.');
    if (!data.timeslots || data.timeslots.length === 0) errors.push('Select at least one timeslot.');
    // Check for empty IDs
    (data.teachers||[]).forEach((t,i) => { if (!t.teacher_id.trim()) errors.push(`Teacher ${i+1} has an empty ID.`); });
    (data.student_groups||[]).forEach((g,i) => { if (!g.group_id.trim()) errors.push(`Student Group ${i+1} has an empty ID.`); });
    (data.rooms||[]).forEach((r,i) => { if (!r.room_id.trim()) errors.push(`Room ${i+1} has an empty ID.`); });
    // Check sections have teachers
    (data.sections||[]).forEach(s => { if (!s.teacher_id) errors.push(`Section "${s.section_id}" has no teacher assigned.`); });
    return errors;
}

// ─── Load / Clear / Generate ────────────────────────────────────────────────
function loadSampleData() {
    formData.teachers = [
        {teacher_id:"T1",name:"Dr. Smith",max_hours_per_week:20},
        {teacher_id:"T2",name:"Dr. Jones",max_hours_per_week:20},
        {teacher_id:"T3",name:"Dr. Brown",max_hours_per_week:20}
    ];
    formData.student_groups = [{group_id:"G1",name:"CS Year 1",size:40},{group_id:"G2",name:"CS Year 2",size:35}];
    formData.rooms = [
        {room_id:"R1",name:"Room 101",capacity:50,room_type:"lecture"},
        {room_id:"R2",name:"Room 102",capacity:45,room_type:"lecture"},
        {room_id:"R3",name:"Room 103",capacity:60,room_type:"lecture"},
        {room_id:"R4",name:"Lab A",capacity:30,room_type:"lab"}
    ];
    formData.courses = [
        {course_id:"CS101",name:"Intro to CS",sections:[{section_id:"CS101-A",course_id:"CS101",lectures_per_week:3,teacher_id:"T1",student_group_ids:["G1"],max_students:40}]},
        {course_id:"CS201",name:"Data Structures",prerequisites:["CS101"],sections:[{section_id:"CS201-A",course_id:"CS201",lectures_per_week:2,teacher_id:"T1",student_group_ids:["G2"],max_students:35}]},
        {course_id:"MATH101",name:"Calculus I",sections:[{section_id:"MATH101-A",course_id:"MATH101",lectures_per_week:3,teacher_id:"T2",student_group_ids:["G1","G2"],max_students:60}]},
        {course_id:"PHY101",name:"Physics I",sections:[{section_id:"PHY101-A",course_id:"PHY101",lectures_per_week:2,teacher_id:"T3",student_group_ids:["G1"],max_students:40}]}
    ];
    formData.timeslots.clear();
    HOURS.forEach((h,pi) => { if (h.hour>=9 && h.hour<=15) DAYS.slice(0,5).forEach(d => formData.timeslots.add(`${d}-${pi+1}`)); });
    idCounters = {teacher:4,group:3,room:5,course:5,section:5};
    renderAll();
    // Also sync to JSON textarea
    document.getElementById('input-json').value = JSON.stringify(buildInputFromForm(), null, 2);
    hideError();
}

document.getElementById('btn-load-sample').addEventListener('click', loadSampleData);

document.getElementById('btn-clear-all').addEventListener('click', () => {
    formData.teachers = []; formData.student_groups = []; formData.rooms = [];
    formData.courses = []; formData.timeslots.clear();
    idCounters = {teacher:1,group:1,room:1,course:1,section:1};
    state.inputData = null; state.result = null; state.graphData = null;
    document.getElementById('input-json').value = '';
    renderAll();
    hideError();
    // Clear viz tabs
    document.getElementById('graph-svg').style.display = 'none';
    document.getElementById('graph-empty').style.display = '';
    document.getElementById('solver-svg').style.display = 'none';
    document.getElementById('solver-empty').style.display = '';
    document.getElementById('timetable-grid').innerHTML = '';
    document.getElementById('timetable-empty').style.display = '';
    document.getElementById('status').textContent = 'Ready';
    localStorage.removeItem('timetable_state');
});

// ─── Generate ───────────────────────────────────────────────────────────────
document.getElementById('btn-generate').addEventListener('click', async () => {
    hideError();
    const isJson = document.getElementById('mode-json').classList.contains('active');
    let inputData;
    if (isJson) {
        try { inputData = JSON.parse(document.getElementById('input-json').value); }
        catch (e) { showError('Invalid JSON: ' + e.message); return; }
    } else {
        inputData = buildInputFromForm();
    }

    const errors = validateInput(inputData);
    if (errors.length > 0) { showError(errors.join(' ')); return; }

    state.inputData = inputData;
    document.getElementById('status').textContent = 'Generating...';

    try {
        const resp = await fetch('/api/v1/generate', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(inputData)
        });
        if (!resp.ok) { const err = await resp.json(); showError(err.error || 'Server error'); return; }
        state.result = await resp.json();

        const n = state.result.iterations;
        document.getElementById('status').textContent =
            `Generated — ${plural(n,'iteration')}, ${state.result.converged ? 'converged' : 'not converged'}`;

        buildGraphData();

        // Switch to graph tab FIRST so containers are visible and have dimensions
        switchTab('graph');

        // Now render — graph is visible, solver/timetable will lazy-render on tab switch
        renderGraph();

        // Persist to localStorage
        try { localStorage.setItem('timetable_state', JSON.stringify({inputData, result:state.result})); } catch(_) {}
    } catch (e) {
        showError('Network error: ' + e.message);
        document.getElementById('status').textContent = 'Error';
    }
});

// ─── Build Graph Data ───────────────────────────────────────────────────────
function buildGraphData() {
    const input = state.inputData, result = state.result;
    if (!input || !result) return;
    const nodes = [], links = [];
    const courseMap = {}; input.courses.forEach(c => { courseMap[c.course_id] = c; });
    const events = [];
    input.sections.forEach(sec => {
        for (let i = 0; i < sec.lectures_per_week; i++) {
            events.push({id:sec.section_id+'_L'+i, section_id:sec.section_id, course_id:sec.course_id,
                teacher_id:sec.teacher_id, student_group_ids:sec.student_group_ids||[], lecture_index:i,
                course_name:courseMap[sec.course_id]?.name||sec.course_id});
        }
    });
    events.forEach(e => {
        const a = result.assignments.find(a => a.event_id === e.id);
        nodes.push({id:e.id,course_id:e.course_id,course_name:e.course_name,section_id:e.section_id,
            teacher_id:e.teacher_id,student_groups:e.student_group_ids,lecture_index:e.lecture_index,
            timeslot:a?a.timeslot:null,room_id:a?a.room_id:null});
    });
    const addLink = (s,t,type,w) => {
        if (!links.find(l=>(l.source===s&&l.target===t)||(l.source===t&&l.target===s)))
            links.push({source:s,target:t,type,weight:w});
    };
    const idx = {};
    events.forEach(e => { (idx[e.teacher_id]=idx[e.teacher_id]||[]).push(e.id); });
    Object.values(idx).forEach(ids => { for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) links.push({source:ids[i],target:ids[j],type:'same_teacher',weight:1000}); });
    const gIdx = {};
    events.forEach(e => e.student_group_ids.forEach(g => { (gIdx[g]=gIdx[g]||[]).push(e.id); }));
    Object.values(gIdx).forEach(ids => { for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) addLink(ids[i],ids[j],'same_student_group',1000); });
    const sIdx = {};
    events.forEach(e => { (sIdx[e.section_id]=sIdx[e.section_id]||[]).push(e.id); });
    Object.values(sIdx).forEach(ids => { for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++) addLink(ids[i],ids[j],'same_section',10); });
    state.graphData = {nodes,links};
}

// ─── Render Graph ───────────────────────────────────────────────────────────
function renderGraph() {
    const data = state.graphData;
    if (!data) return;
    document.getElementById('graph-empty').style.display = 'none';
    const svgEl = document.getElementById('graph-svg');
    svgEl.style.display = 'block';
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // Use parent dimensions after display:block
    const rect = svgEl.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 300);
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const courses = [...new Set(data.nodes.map(n=>n.course_id))];
    const colorScale = d3.scaleOrdinal().domain(courses).range(COLORS);
    const degree = {};
    data.nodes.forEach(n=>{degree[n.id]=0;});
    data.links.forEach(l=>{degree[l.source.id||l.source]++;degree[l.target.id||l.target]++;});

    const sim = d3.forceSimulation(data.nodes)
        .force('link',d3.forceLink(data.links).id(d=>d.id).distance(100))
        .force('charge',d3.forceManyBody().strength(-300))
        .force('center',d3.forceCenter(width/2,height/2))
        .force('collision',d3.forceCollide().radius(d=>10+degree[d.id]*2));

    const link = svg.append('g').selectAll('line').data(data.links).join('line')
        .attr('stroke',d=>d.weight>=1000?'#f85149':d.weight>=500?'#d29922':'#484f58')
        .attr('stroke-width',d=>d.weight>=1000?2:1).attr('stroke-opacity',0.6);

    const node = svg.append('g').selectAll('circle').data(data.nodes).join('circle')
        .attr('r',d=>8+(degree[d.id]||0)*1.5)
        .attr('fill',d=>colorScale(d.course_id)).attr('stroke','#0f1419').attr('stroke-width',2)
        .style('cursor','pointer')
        .call(d3.drag()
            .on('start',(e,d)=>{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y;})
            .on('drag',(e,d)=>{d.fx=e.x;d.fy=e.y;})
            .on('end',(e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null;}));

    const label = svg.append('g').selectAll('text').data(data.nodes).join('text')
        .text(d=>d.course_name+' L'+d.lecture_index)
        .attr('font-size',10).attr('fill','#8b949e').attr('text-anchor','middle').attr('dy',-14)
        .style('pointer-events','none');

    // Node click — use stopPropagation to prevent svg click from clearing it
    node.on('click',(e,d)=>{
        e.stopPropagation();
        document.getElementById('node-details').innerHTML = `<dl>
            <dt>Event</dt><dd>${d.id}</dd>
            <dt>Course</dt><dd>${d.course_name}</dd>
            <dt>Teacher</dt><dd>${d.teacher_id}</dd>
            <dt>Groups</dt><dd>${d.student_groups.join(', ')||'—'}</dd>
            <dt>Timeslot</dt><dd>${d.timeslot||'—'}</dd>
            <dt>Room</dt><dd>${d.room_id||'—'}</dd>
            <dt>Conflicts</dt><dd>${degree[d.id]} edges</dd>
        </dl>`;
        const neighbors = new Set();
        data.links.forEach(l=>{
            const s=l.source.id||l.source, t=l.target.id||l.target;
            if(s===d.id)neighbors.add(t); if(t===d.id)neighbors.add(s);
        });
        node.attr('opacity',n=>n.id===d.id||neighbors.has(n.id)?1:0.2);
        link.attr('opacity',l=>{const s=l.source.id||l.source,t=l.target.id||l.target;return s===d.id||t===d.id?1:0.1;});
        label.attr('opacity',n=>n.id===d.id||neighbors.has(n.id)?1:0.1);
    });

    svg.on('click',()=>{node.attr('opacity',1);link.attr('opacity',0.6);label.attr('opacity',1);});

    sim.on('tick',()=>{
        const p=30;
        data.nodes.forEach(d=>{d.x=Math.max(p,Math.min(width-p,d.x));d.y=Math.max(p,Math.min(height-p,d.y));});
        link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
        node.attr('cx',d=>d.x).attr('cy',d=>d.y);
        label.attr('x',d=>d.x).attr('y',d=>d.y);
    });

    const legend = document.getElementById('graph-legend');
    legend.innerHTML = courses.map(c=>{
        const name = state.inputData.courses.find(x=>x.course_id===c)?.name||c;
        return `<div class="legend-item"><div class="legend-dot" style="background:${colorScale(c)}"></div>${name}</div>`;
    }).join('') +
        '<div class="legend-item"><div class="legend-dot" style="background:#f85149"></div>Hard conflict</div>' +
        '<div class="legend-item"><div class="legend-dot" style="background:#484f58"></div>Soft conflict</div>';

    document.getElementById('graph-stats').innerHTML =
        `<div class="metric"><span>Nodes</span><span class="metric-value">${data.nodes.length}</span></div>`+
        `<div class="metric"><span>Edges</span><span class="metric-value">${data.links.length}</span></div>`+
        `<div class="metric"><span>Hard</span><span class="metric-value">${data.links.filter(l=>l.weight>=1000).length}</span></div>`+
        `<div class="metric"><span>Soft</span><span class="metric-value">${data.links.filter(l=>l.weight<1000).length}</span></div>`;
}

// ─── Solver View ────────────────────────────────────────────────────────────
function renderSolverView() {
    if (!state.graphData || !state.result) return;
    document.getElementById('solver-empty').style.display = 'none';
    const svgEl = document.getElementById('solver-svg');
    svgEl.style.display = 'block';
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const rect = svgEl.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const height = Math.max(rect.height, 300);
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const tsList = [...new Set(state.result.assignments.map(a=>a.timeslot))].sort();
    const tsColor = d3.scaleOrdinal().domain(tsList).range(COLORS);
    const data = state.graphData;

    const sim = d3.forceSimulation(data.nodes)
        .force('link',d3.forceLink(data.links).id(d=>d.id).distance(80))
        .force('charge',d3.forceManyBody().strength(-250))
        .force('center',d3.forceCenter(width/2,height/2));

    const link = svg.append('g').selectAll('line').data(data.links).join('line')
        .attr('stroke','#484f58').attr('stroke-width',1).attr('stroke-opacity',0.4);
    const node = svg.append('g').selectAll('circle').data(data.nodes).join('circle')
        .attr('r',12).attr('fill',d=>d.timeslot?tsColor(d.timeslot):'#484f58')
        .attr('stroke','#0f1419').attr('stroke-width',2);
    const label = svg.append('g').selectAll('text').data(data.nodes).join('text')
        .text(d=>(d.course_name||'').split(' ')[0]).attr('font-size',9).attr('fill','#e7e9ea').attr('text-anchor','middle').attr('dy',3)
        .style('pointer-events','none');

    sim.on('tick',()=>{
        const p=30;
        data.nodes.forEach(d=>{d.x=Math.max(p,Math.min(width-p,d.x));d.y=Math.max(p,Math.min(height-p,d.y));});
        link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
        node.attr('cx',d=>d.x).attr('cy',d=>d.y);
        label.attr('x',d=>d.x).attr('y',d=>d.y);
    });

    link.attr('stroke',l=>{
        if(l.weight>=1000){const s=data.nodes.find(n=>n.id===(l.source.id||l.source)),t=data.nodes.find(n=>n.id===(l.target.id||l.target));
            if(s&&t&&s.timeslot===t.timeslot)return '#f85149';}return '#484f58';});

    document.getElementById('solver-legend').innerHTML = tsList.map(ts=>
        `<div class="legend-item"><div class="legend-dot" style="background:${tsColor(ts)}"></div>${ts}</div>`).join('');

    const m = state.result?.metrics||{};
    document.getElementById('solver-metrics').innerHTML =
        `<div class="metric"><span>Social Welfare</span><span class="metric-value">${m.social_welfare??'—'}</span></div>`+
        `<div class="metric"><span>Fairness</span><span class="metric-value">${m.fairness_index??'—'}</span></div>`+
        `<div class="metric"><span>Hard Conflicts</span><span class="metric-value" style="color:${m.hard_conflicts>0?'#f85149':'#3fb950'}">${m.hard_conflicts??'—'}</span></div>`+
        `<div class="metric"><span>Soft Conflicts</span><span class="metric-value">${m.soft_conflicts??'—'}</span></div>`+
        `<div class="metric"><span>Room Util.</span><span class="metric-value">${m.room_utilization?(m.room_utilization*100).toFixed(0)+'%':'—'}</span></div>`+
        `<div class="metric"><span>Pref Sat.</span><span class="metric-value">${m.preference_satisfaction?(m.preference_satisfaction*100).toFixed(0)+'%':'—'}</span></div>`+
        `<div class="metric"><span>Iterations</span><span class="metric-value">${state.result?.iterations??'—'}</span></div>`+
        `<div class="metric"><span>Converged</span><span class="metric-value" style="color:${state.result?.converged?'#3fb950':'#f85149'}">${state.result?.converged?'Yes':'No'}</span></div>`;
}

// ─── Timetable Grid ─────────────────────────────────────────────────────────
function renderTimetableGrid(filterType, filterValue) {
    if (!state.result || !state.inputData) return;
    document.getElementById('timetable-empty').style.display = 'none';

    const input = state.inputData, assignments = state.result.assignments;
    const courseMap = {}; input.courses.forEach(c=>{courseMap[c.course_id]=c;});
    const days = [...new Set(input.timeslots.map(t=>t.day))];
    const periods = [...new Set(input.timeslots.map(t=>t.period))].sort((a,b)=>a-b);

    const eventInfo = {};
    input.sections.forEach(sec=>{for(let i=0;i<sec.lectures_per_week;i++){
        eventInfo[sec.section_id+'_L'+i] = {course_name:courseMap[sec.course_id]?.name||sec.course_id,section_id:sec.section_id,teacher_id:sec.teacher_id,student_group_ids:sec.student_group_ids||[]};
    }});

    const cNames = [...new Set(Object.values(eventInfo).map(e=>e.course_name))];
    const colorScale = d3.scaleOrdinal().domain(cNames).range(COLORS);

    let filtered = assignments;
    if (filterType==='teacher'&&filterValue) { const r=new Set(Object.entries(eventInfo).filter(([,i])=>i.teacher_id===filterValue).map(([e])=>e)); filtered=assignments.filter(a=>r.has(a.event_id)); }
    else if (filterType==='student_group'&&filterValue) { const r=new Set(Object.entries(eventInfo).filter(([,i])=>i.student_group_ids.includes(filterValue)).map(([e])=>e)); filtered=assignments.filter(a=>r.has(a.event_id)); }
    else if (filterType==='room'&&filterValue) { filtered=assignments.filter(a=>a.room_id===filterValue); }

    const grid = {};
    days.forEach(d=>{grid[d]={};periods.forEach(p=>{grid[d][p]=[];});});
    filtered.forEach(a=>{
        const dm=days.find(d=>a.timeslot.includes(d)),pm=a.timeslot.match(/P(\d+)/);
        if(dm&&pm){const p=parseInt(pm[1]);if(grid[dm]?.[p]!==undefined)grid[dm][p].push(a);}
    });

    let html = '<table class="timetable"><thead><tr><th>Period</th>';
    days.forEach(d=>{html+=`<th>${d}</th>`;});
    html += '</tr></thead><tbody>';
    periods.forEach(p=>{
        html+=`<tr><th>P${p}<br><small>${HOURS[p-1]?.hour||(7+p)}:00</small></th>`;
        days.forEach(d=>{html+='<td>';(grid[d][p]||[]).forEach(a=>{
            const info=eventInfo[a.event_id]||{};const bg=colorScale(info.course_name||'');
            html+=`<div class="cell-event" style="background:${bg}33;border-left:3px solid ${bg}"><div class="course">${info.course_name||a.event_id}</div><div class="details">${info.teacher_id||''} ${a.room_id?'| '+a.room_id:''}</div></div>`;
        });html+='</td>';});
        html+='</tr>';
    });
    html+='</tbody></table>';
    document.getElementById('timetable-grid').innerHTML = html;

    const m = state.result.metrics||{};
    document.getElementById('timetable-metrics').innerHTML =
        `<div class="metric"><span>Social Welfare</span><span class="metric-value">${m.social_welfare??'—'}</span></div>`+
        `<div class="metric"><span>Fairness</span><span class="metric-value">${m.fairness_index??'—'}</span></div>`+
        `<div class="metric"><span>Hard Conflicts</span><span class="metric-value" style="color:${m.hard_conflicts>0?'#f85149':'#3fb950'}">${m.hard_conflicts}</span></div>`+
        `<div class="metric"><span>Soft Conflicts</span><span class="metric-value">${m.soft_conflicts}</span></div>`+
        `<div class="metric"><span>Room Util.</span><span class="metric-value">${m.room_utilization?(m.room_utilization*100).toFixed(0)+'%':'—'}</span></div>`;

    const v = state.result.validation||{};
    let vh = v.valid ? '<div style="color:#3fb950;font-size:13px;">No hard violations</div>'
        : '<div style="color:#f85149;font-size:13px;">Hard violations found!</div>';
    (v.hard_violations||[]).forEach(h=>{vh+=`<div style="color:#f85149;font-size:12px;margin-top:4px;">- ${h}</div>`;});
    if((v.soft_violations||[]).length>0) vh+=`<div style="color:#d29922;font-size:12px;margin-top:8px;">${v.soft_violations.length} soft violations</div>`;
    document.getElementById('timetable-validation').innerHTML = vh;
}

// ─── Filters ────────────────────────────────────────────────────────────────
function populateFilters() {
    const ft = document.getElementById('filter-type');
    const fv = document.getElementById('filter-value');
    const newFt = ft.cloneNode(true);
    ft.parentNode.replaceChild(newFt, ft);
    const newFv = fv.cloneNode(true);
    fv.parentNode.replaceChild(newFv, fv);
    newFt.addEventListener('change',()=>{
        const t = newFt.value;
        newFv.innerHTML = '<option value="">All</option>';
        if(t==='teacher') state.inputData.teachers.forEach(t=>{newFv.innerHTML+=`<option value="${t.teacher_id}">${t.name}</option>`;});
        else if(t==='student_group') state.inputData.student_groups.forEach(g=>{newFv.innerHTML+=`<option value="${g.group_id}">${g.name}</option>`;});
        else if(t==='room') state.inputData.rooms.forEach(r=>{newFv.innerHTML+=`<option value="${r.room_id}">${r.name}</option>`;});
        renderTimetableGrid(t,'');
    });
    newFv.addEventListener('change',()=>{renderTimetableGrid(newFt.value,newFv.value);});
}

// ─── Restore state from localStorage on load ────────────────────────────────
function restoreState() {
    try {
        const saved = localStorage.getItem('timetable_state');
        if (saved) {
            const {inputData, result} = JSON.parse(saved);
            state.inputData = inputData;
            state.result = result;
            loadFormFromJSON(inputData);
            buildGraphData();
            // Don't render graph/solver yet — they need visible containers.
            // They'll render when user switches to those tabs.
            const n = result.iterations;
            document.getElementById('status').textContent =
                `Restored — ${plural(n,'iteration')}, ${result.converged?'converged':'not converged'}`;
            return true;
        }
    } catch(_) {}
    return false;
}

// Lazy-render graph/solver when tab becomes visible (needs dimensions)
const tabObserver = new MutationObserver(() => {
    if (state.result && document.getElementById('tab-graph').classList.contains('active')) {
        if (document.getElementById('graph-svg').style.display === 'none' || !document.getElementById('graph-svg').hasChildNodes()) {
            renderGraph();
        }
    }
    if (state.result && document.getElementById('tab-solver').classList.contains('active')) {
        if (document.getElementById('solver-svg').style.display === 'none' || !document.getElementById('solver-svg').hasChildNodes()) {
            renderSolverView();
        }
    }
    if (state.result && document.getElementById('tab-timetable').classList.contains('active')) {
        if (!document.getElementById('timetable-grid').hasChildNodes()) {
            renderTimetableGrid();
            populateFilters();
        }
    }
});
document.querySelectorAll('.tab-content').forEach(el => {
    tabObserver.observe(el, {attributes:true, attributeFilter:['class']});
});

// ─── Submissions Tab ────────────────────────────────────────────────────────
async function loadSubmissions() {
    try {
        const resp = await fetch('/api/v1/submissions');
        const subs = await resp.json();
        const el = document.getElementById('submissions-list');
        if (!subs.length) {
            el.innerHTML = '<div class="empty-state" style="height:auto;padding:40px;"><p>No submissions yet. Share the portal link with stakeholders.</p></div>';
            return subs;
        }
        el.innerHTML = subs.map(s => {
            const roleLabel = s.role === 'teacher' ? 'Teacher' : s.role === 'student_group' ? 'Student Group' : 'Room';
            let detail = '';
            if (s.role === 'teacher' && s.courses) {
                detail = `Courses: ${s.courses.map(c=>c.name||c.course_id).join(', ')||'none'}`;
            } else if (s.role === 'student_group' && s.courses) {
                detail = `Courses: ${s.courses.map(c=>c.name||c.course_id).join(', ')||'none'} | Size: ${s.group_size||'?'}`;
            } else if (s.role === 'room') {
                detail = `Capacity: ${s.capacity||'?'} | Type: ${s.room_type||'lecture'} | Equipment: ${(s.equipment||[]).join(', ')||'none'}`;
            }
            const prefCount = (s.preferences?.weights||[]).length;
            const prefSummary = prefCount > 0 ? `${prefCount} timeslot preferences set` : 'No timeslot preferences';
            return `<div class="sub-card">
                <div class="sub-header">
                    <span class="sub-name">${esc(s.entity_name||s.entity_id)}</span>
                    <span class="sub-role ${s.role}">${roleLabel}</span>
                </div>
                <div class="sub-meta">${esc(s.entity_id)} &middot; Submitted ${s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '?'}</div>
                <div class="sub-detail">${esc(detail)}</div>
                <div class="sub-detail">${prefSummary}</div>
            </div>`;
        }).join('');
        return subs;
    } catch(e) {
        document.getElementById('submissions-list').innerHTML = `<div style="color:#f85149;">Failed to load: ${e.message}</div>`;
        return [];
    }
}

document.getElementById('btn-refresh-subs').addEventListener('click', loadSubmissions);

document.getElementById('btn-clear-subs').addEventListener('click', async () => {
    await fetch('/api/v1/submissions/clear', {method:'POST'});
    loadSubmissions();
});

document.getElementById('btn-merge-subs').addEventListener('click', async () => {
    const subs = await loadSubmissions();
    if (!subs.length) return;

    let merged = 0;
    subs.forEach(s => {
        if (s.role === 'teacher') {
            // Add teacher if not exists
            if (!formData.teachers.find(t => t.teacher_id === s.entity_id)) {
                formData.teachers.push({teacher_id:s.entity_id, name:s.entity_name||s.entity_id, max_hours_per_week:20});
                merged++;
            }
            // Add courses and sections
            (s.courses||[]).forEach(c => {
                if (!formData.courses.find(fc => fc.course_id === c.course_id)) {
                    formData.courses.push({
                        course_id:c.course_id, name:c.name||c.course_id, sections:[{
                            section_id:c.course_id+'-A', course_id:c.course_id,
                            lectures_per_week:c.lectures_per_week||3,
                            teacher_id:s.entity_id, student_group_ids:[], max_students:60
                        }]
                    });
                    merged++;
                } else {
                    // Ensure this teacher is assigned to a section
                    const course = formData.courses.find(fc => fc.course_id === c.course_id);
                    const hasSection = course.sections.some(sec => sec.teacher_id === s.entity_id);
                    if (!hasSection && course.sections.length > 0) {
                        // Assign teacher to first unassigned section, or create new one
                        const unassigned = course.sections.find(sec => !sec.teacher_id);
                        if (unassigned) { unassigned.teacher_id = s.entity_id; merged++; }
                    }
                }
            });
        } else if (s.role === 'student_group') {
            if (!formData.student_groups.find(g => g.group_id === s.entity_id)) {
                formData.student_groups.push({group_id:s.entity_id, name:s.entity_name||s.entity_id, size:s.group_size||30});
                merged++;
            }
            // Link group to course sections
            (s.courses||[]).forEach(c => {
                const course = formData.courses.find(fc => fc.course_id === c.course_id);
                if (course) {
                    course.sections.forEach(sec => {
                        if (!sec.student_group_ids.includes(s.entity_id)) {
                            sec.student_group_ids.push(s.entity_id);
                            merged++;
                        }
                    });
                }
            });
        } else if (s.role === 'room') {
            if (!formData.rooms.find(r => r.room_id === s.entity_id)) {
                formData.rooms.push({room_id:s.entity_id, name:s.entity_name||s.entity_id, capacity:s.capacity||40, room_type:s.room_type||'lecture'});
                merged++;
            }
            // Merge room availability into timeslots
            (s.preferences?.weights||[]).forEach(w => {
                if (w.weight > 0) {
                    const dayName = typeof w.day === 'string' ? w.day : '';
                    if (dayName && w.period) formData.timeslots.add(`${dayName}-${w.period}`);
                }
            });
        }
    });

    renderAll();
    document.getElementById('status').textContent = `Merged ${merged} items from ${subs.length} submissions`;
    switchTab('input');
});

// Auto-load submissions when tab becomes visible
const subTabEl = document.getElementById('tab-submissions');
if (subTabEl) {
    const subObserver = new MutationObserver(() => {
        if (subTabEl.classList.contains('active')) loadSubmissions();
    });
    subObserver.observe(subTabEl, {attributes:true, attributeFilter:['class']});
}

// Also add 'submissions' to allowed hash tabs
const origSwitchTab = switchTab;

// ─── Init ───────────────────────────────────────────────────────────────────
if (!restoreState()) {
    loadSampleData();
}
