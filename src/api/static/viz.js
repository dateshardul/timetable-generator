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
let formData = { teachers:[], student_groups:[], rooms:[], courses:[], timeslots:new Set(), preferences:[] };
let state = { inputData:null, result:null, graphData:null, generation:0 };
let renderedGeneration = { solver:0, timetable:0 };
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
        preferences: formData.preferences || []
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
    // 8 teachers across CS, Math, Physics departments
    formData.teachers = [
        {teacher_id:"T1",name:"Dr. Smith (CS)",max_hours_per_week:18},
        {teacher_id:"T2",name:"Dr. Jones (CS)",max_hours_per_week:16},
        {teacher_id:"T3",name:"Dr. Brown (Math)",max_hours_per_week:20},
        {teacher_id:"T4",name:"Dr. Patel (Physics)",max_hours_per_week:18},
        {teacher_id:"T5",name:"Dr. Chen (CS)",max_hours_per_week:14},
        {teacher_id:"T6",name:"Dr. Wilson (Math)",max_hours_per_week:16},
        {teacher_id:"T7",name:"Dr. Garcia (CS)",max_hours_per_week:18},
        {teacher_id:"T8",name:"Prof. Lee (Physics)",max_hours_per_week:12},
    ];

    // 4 student groups with different sizes and overlapping enrollments
    formData.student_groups = [
        {group_id:"G1",name:"CS Year 1",size:45},
        {group_id:"G2",name:"CS Year 2",size:38},
        {group_id:"G3",name:"CS Year 3",size:30},
        {group_id:"G4",name:"Math+Physics Joint",size:25},
    ];

    // 6 rooms — tight enough that room assignment matters
    formData.rooms = [
        {room_id:"R1",name:"Lecture Hall A",capacity:120,room_type:"lecture"},
        {room_id:"R2",name:"Lecture Hall B",capacity:80,room_type:"lecture"},
        {room_id:"R3",name:"Room 201",capacity:50,room_type:"lecture"},
        {room_id:"R4",name:"Room 202",capacity:50,room_type:"lecture"},
        {room_id:"R5",name:"Seminar Room",capacity:30,room_type:"lecture"},
        {room_id:"R6",name:"CS Lab",capacity:35,room_type:"lab"},
    ];

    // 10 courses with prerequisites, labs, multi-section, shared groups
    // This creates ~30 events (lectures) — enough for interesting conflicts
    formData.courses = [
        // Year 1 core — G1 takes all of these
        {course_id:"CS101",name:"Intro to Programming",sections:[
            {section_id:"CS101-A",course_id:"CS101",lectures_per_week:3,teacher_id:"T1",student_group_ids:["G1"],max_students:45},
        ]},
        {course_id:"CS102",name:"Programming Lab",sections:[
            {section_id:"CS102-A",course_id:"CS102",lectures_per_week:2,teacher_id:"T2",student_group_ids:["G1"],max_students:35,section_type:"lab"},
        ]},
        {course_id:"MATH101",name:"Calculus I",sections:[
            // Shared between CS Year 1 and Math+Physics — big conflict potential
            {section_id:"MATH101-A",course_id:"MATH101",lectures_per_week:3,teacher_id:"T3",student_group_ids:["G1","G4"],max_students:70},
        ]},
        {course_id:"PHY101",name:"Physics I",sections:[
            {section_id:"PHY101-A",course_id:"PHY101",lectures_per_week:2,teacher_id:"T4",student_group_ids:["G1","G4"],max_students:70},
            {section_id:"PHY101-L",course_id:"PHY101",lectures_per_week:1,teacher_id:"T8",student_group_ids:["G4"],max_students:25,section_type:"lab"},
        ]},

        // Year 2 — G2 takes these, prerequisites from Year 1
        {course_id:"CS201",name:"Data Structures",prerequisites:["CS101"],sections:[
            {section_id:"CS201-A",course_id:"CS201",lectures_per_week:3,teacher_id:"T1",student_group_ids:["G2"],max_students:38},
        ]},
        {course_id:"CS202",name:"Algorithms Lab",prerequisites:["CS101"],sections:[
            {section_id:"CS202-A",course_id:"CS202",lectures_per_week:2,teacher_id:"T5",student_group_ids:["G2"],max_students:35,section_type:"lab"},
        ]},
        {course_id:"MATH201",name:"Linear Algebra",prerequisites:["MATH101"],sections:[
            // Shared between CS Year 2 and Math+Physics joint
            {section_id:"MATH201-A",course_id:"MATH201",lectures_per_week:3,teacher_id:"T6",student_group_ids:["G2","G4"],max_students:63},
        ]},

        // Year 3 — G3 takes these, advanced courses
        {course_id:"CS301",name:"Operating Systems",prerequisites:["CS201"],sections:[
            {section_id:"CS301-A",course_id:"CS301",lectures_per_week:2,teacher_id:"T7",student_group_ids:["G3"],max_students:30},
        ]},
        {course_id:"CS302",name:"Machine Learning",prerequisites:["CS201","MATH201"],sections:[
            // T5 teaches this AND the Year 2 lab — creates teacher conflicts
            {section_id:"CS302-A",course_id:"CS302",lectures_per_week:2,teacher_id:"T5",student_group_ids:["G3"],max_students:30},
        ]},
        {course_id:"CS303",name:"Database Systems",prerequisites:["CS201"],sections:[
            // T1 teaches this AND Year 1 + Year 2 CS — heavy teacher load
            {section_id:"CS303-A",course_id:"CS303",lectures_per_week:2,teacher_id:"T1",student_group_ids:["G3"],max_students:30},
        ]},
    ];

    // TIGHT schedule: 4 days x 4 periods = 16 slots for 25 events
    // This creates initial conflicts that the solver resolves — great for demo
    formData.timeslots.clear();
    ['Monday','Tuesday','Wednesday','Thursday'].forEach(d => {
        [2,3,4,5].forEach(pi => formData.timeslots.add(`${d}-${pi}`)); // 9 AM - 12 PM
    });

    idCounters = {teacher:9,group:5,room:7,course:11,section:12};
    renderAll();
    document.getElementById('input-json').value = JSON.stringify(buildInputFromForm(), null, 2);
    hideError();
}

document.getElementById('btn-load-sample').addEventListener('click', loadSampleData);

document.getElementById('btn-clear-all').addEventListener('click', () => {
    formData.teachers = []; formData.student_groups = []; formData.rooms = [];
    formData.courses = []; formData.timeslots.clear(); formData.preferences = [];
    idCounters = {teacher:1,group:1,room:1,course:1,section:1};
    state.inputData = null; state.result = null; state.graphData = null;
    document.getElementById('input-json').value = '';
    renderAll();
    hideError();
    // Clear viz tabs
    document.getElementById('graph-svg').style.display = 'none';
    document.getElementById('graph-empty').style.display = '';
    document.getElementById('anim-grid-wrap').style.display = 'none';
    document.getElementById('anim-grid-wrap').innerHTML = '';
    document.getElementById('bipartite-wrap').style.display = 'none';
    d3.select('#bipartite-svg').selectAll('*').remove();
    document.getElementById('auction-wrap').style.display = 'none';
    auctionState.initialized = false;
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

    // Attach solver weights from sliders
    const wTs = parseInt(document.getElementById('w-timeslot')?.value || 60);
    const wTe = parseInt(document.getElementById('w-teacher')?.value || 25);
    const wCo = parseInt(document.getElementById('w-course')?.value || 15);
    const wSum = wTs + wTe + wCo || 100;
    inputData.solver_weights = {
        timeslot: wTs / wSum,
        teacher: wTe / wSum,
        course: wCo / wSum,
    };

    const errors = validateInput(inputData);
    if (errors.length > 0) { showError(errors.join(' ')); return; }

    state.inputData = inputData;
    document.getElementById('status').textContent = 'Generating...';

    try {
        const demoMode = document.getElementById('demo-mode')?.checked;
        const url = '/api/v1/generate' + (demoMode ? '?demo=1' : '');
        const resp = await fetch(url, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(inputData)
        });
        if (!resp.ok) { const err = await resp.json(); showError(err.error || 'Server error'); return; }
        state.result = await resp.json();

        const n = state.result.iterations;
        const feas = state.result.feasibility || {};
        let statusText = `Generated — ${plural(n,'iteration')}, ${state.result.converged ? 'converged' : 'not converged'}`;

        // Show feasibility warnings/errors
        if (feas.errors?.length > 0) {
            showError('Infeasible: ' + feas.errors.join(' '));
            statusText += ' (INFEASIBLE)';
        } else if (feas.warnings?.length > 0) {
            showError('Warning: ' + feas.warnings.join(' '));
        }
        document.getElementById('status').textContent = statusText;

        state.generation++;
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

// ─── Solver Animation (timetable filling step-by-step) ─────────────────────
let animState = { stepIdx:0, playing:false, timer:null, steps:[], eventInfo:{} };

function renderSolverView() {
    if (!state.result || !state.inputData) return;
    const steps = state.result.steps || [];
    if (!steps.length) return;

    document.getElementById('solver-empty').style.display = 'none';
    // Show whichever main view is active
    const activeView = document.querySelector('.main-view-btn.active')?.dataset?.mainview || 'grid';
    document.getElementById('anim-grid-wrap').style.display = activeView === 'grid' ? '' : 'none';
    document.getElementById('bipartite-wrap').style.display = activeView === 'bipartite' ? '' : 'none';
    document.getElementById('auction-wrap').style.display = activeView === 'auction' ? '' : 'none';

    const input = state.inputData;
    const courseMap = {}; input.courses.forEach(c=>{courseMap[c.course_id]=c;});
    const days = [...new Set(input.timeslots.map(t=>t.day))];
    const periods = [...new Set(input.timeslots.map(t=>t.period))].sort((a,b)=>a-b);

    // Build event info lookup
    const eventInfo = {};
    input.sections.forEach(sec=>{for(let i=0;i<sec.lectures_per_week;i++){
        const eid = sec.section_id+'_L'+i;
        eventInfo[eid] = {course_name:courseMap[sec.course_id]?.name||sec.course_id, course_id:sec.course_id, section_id:sec.section_id, teacher_id:sec.teacher_id, student_group_ids:sec.student_group_ids||[]};
    }});

    const cNames = [...new Set(Object.values(eventInfo).map(e=>e.course_name))];
    const colorScale = d3.scaleOrdinal().domain(cNames).range(COLORS);

    // Build empty grid HTML
    let html = '<table class="timetable"><thead><tr><th>Period</th>';
    days.forEach(d=>{html+=`<th>${d}</th>`;});
    html += '</tr></thead><tbody>';
    periods.forEach(p=>{
        html+=`<tr><th>P${p}<br><small>${HOURS[p-1]?.hour||(7+p)}:00</small></th>`;
        days.forEach(d=>{html+=`<td id="anim-cell-${d}-${p}"></td>`;});
        html+='</tr>';
    });
    html+='</tbody></table>';
    document.getElementById('anim-grid-wrap').innerHTML = html;

    // Store animation state
    animState.steps = steps;
    animState.eventInfo = eventInfo;
    animState.colorScale = colorScale;
    animState.days = days;
    animState.periods = periods;
    animState.stepIdx = 0;
    animState.playing = false;
    if (animState.timer) { clearInterval(animState.timer); animState.timer = null; }

    // Update totals
    const totalEvents = Object.keys(eventInfo).length;
    document.getElementById('anim-step-total').textContent = steps.length;
    document.getElementById('anim-total-events').textContent = totalEvents;
    document.getElementById('anim-log').innerHTML = '';

    // Build player cards (all start as "waiting")
    const cardsHtml = Object.entries(eventInfo).map(([eid, info]) => {
        const bg = colorScale(info.course_name || '');
        return `<div class="player-card pc-waiting" id="pc-${eid.replace(/[^a-zA-Z0-9]/g,'_')}">
            <div class="pc-name" style="color:${bg};">${info.course_name} <span style="color:#484f58;font-weight:400;">L${eid.split('_L')[1]||0}</span></div>
            <div class="pc-status">
                <span style="color:#484f58;">&#9679;</span> Waiting for slot...
            </div>
            <div class="pc-bar" style="width:0%;"></div>
        </div>`;
    }).join('');
    document.getElementById('player-cards').innerHTML = cardsHtml;

    updateAnimScoreboard(0, 0, new Set(), '—');

    // Render active view
    const activeV = document.querySelector('.main-view-btn.active')?.dataset?.mainview;
    if (activeV === 'bipartite') renderBipartite();
    if (activeV === 'auction') renderAuction();
}

function parseTimeslotStr(tsStr) {
    // "Monday P1 (09:00)" -> {day:"Monday", period:1}
    const dayMatch = DAYS.find(d => tsStr.includes(d));
    const pMatch = tsStr.match(/P(\d+)/);
    if (dayMatch && pMatch) return {day:dayMatch, period:parseInt(pMatch[1])};
    return null;
}

function animStep() {
    if (animState.stepIdx >= animState.steps.length) {
        animPause();
        document.getElementById('anim-narration').innerHTML =
            '<span style="color:#3fb950;">&#10003; Nash Equilibrium reached! No player can improve by switching.</span>';
        // Mark all player cards as settled
        document.querySelectorAll('.player-card').forEach(c => {
            c.classList.remove('pc-moving','pc-conflict');
            if (c.classList.contains('pc-placed')) c.classList.replace('pc-placed','pc-settled');
        });
        // (D) Nash sweep on bipartite graph + auction completion
        bpNashSweep();
        auctionComplete();
        return;
    }

    const step = animState.steps[animState.stepIdx];
    const info = animState.eventInfo[step.event_id] || {};
    const bg = animState.colorScale(info.course_name || '');
    const ts = parseTimeslotStr(step.timeslot);

    // If this is a move (best_response), remove from old slot first
    if (step.old_timeslot) {
        const oldTs = parseTimeslotStr(step.old_timeslot);
        if (oldTs) {
            const oldCell = document.getElementById(`anim-cell-${oldTs.day}-${oldTs.period}`);
            if (oldCell) {
                const oldEl = oldCell.querySelector(`[data-eid="${step.event_id}"]`);
                if (oldEl) {
                    oldEl.classList.add('anim-old-slot');
                    setTimeout(() => oldEl.remove(), 300);
                }
            }
        }
    }

    // Remove "latest" highlight from all cells
    document.querySelectorAll('.anim-latest').forEach(el => el.classList.remove('anim-latest'));

    // Place into new slot
    if (ts) {
        const cell = document.getElementById(`anim-cell-${ts.day}-${ts.period}`);
        if (cell) {
            const div = document.createElement('div');
            div.className = `cell-event ${step.phase==='greedy'?'anim-placed':'anim-moved'} anim-latest`;
            div.dataset.eid = step.event_id;
            div.style.cssText = `background:${bg}33;border-left:3px solid ${bg};`;
            div.innerHTML = `<div class="course">${info.course_name||step.event_id}</div><div class="details">${info.teacher_id||''}</div>`;
            cell.appendChild(div);
        }
    }

    // Track placed events
    const placedSet = new Set();
    for (let i = 0; i <= animState.stepIdx; i++) {
        placedSet.add(animState.steps[i].event_id);
    }

    // Update scoreboard
    const phaseLabel = step.phase === 'greedy' ? 'Greedy Placement' : 'Best Response';
    updateAnimScoreboard(animState.stepIdx + 1, step.conflicts_after, placedSet, phaseLabel);

    // Narration
    const courseName = info.course_name || step.event_id;
    let narr = '';
    if (step.phase === 'greedy') {
        narr = `<span style="color:#58a6ff;">&#9654;</span> Placing <strong>${courseName}</strong> at ${step.timeslot}`;
        if (step.conflicts_after > 0) narr += ` <span style="color:#f85149;">(${step.conflicts_after} conflict${step.conflicts_after>1?'s':''})</span>`;
        else narr += ' <span style="color:#3fb950;">(no conflicts)</span>';
    } else {
        narr = `<span style="color:#3fb950;">&#8634;</span> Moving <strong>${courseName}</strong> from ${step.old_timeslot} &rarr; ${step.timeslot}`;
        const delta = step.conflicts_before - step.conflicts_after;
        if (delta > 0) narr += ` <span style="color:#3fb950;">(-${delta} conflict${delta>1?'s':''}!)</span>`;
    }
    narr += `<div style="font-size:11px;color:#484f58;margin-top:2px;">${step.reason}</div>`;
    document.getElementById('anim-narration').innerHTML = narr;

    // Log entry — write to both hidden log and bipartite overlay
    const logHtml = `<div class="anim-log-entry ${step.phase}"><strong>${courseName}</strong> &rarr; ${step.timeslot.replace(/\(.*\)/,'')} ${step.conflicts_after>0?'<span style="color:#f85149;">('+step.conflicts_after+' conflicts)</span>':'<span style="color:#3fb950;">&#10003;</span>'}</div>`;
    const log = document.getElementById('anim-log');
    log.insertAdjacentHTML('afterbegin', logHtml);
    const bpLog = document.getElementById('bp-log-overlay');
    if (bpLog) {
        bpLog.insertAdjacentHTML('afterbegin', logHtml);
        // Keep only last 8 entries in overlay
        while (bpLog.children.length > 8) bpLog.removeChild(bpLog.lastChild);
    }

    // ── Update player cards ──
    // Reset all cards to remove "active" highlight
    document.querySelectorAll('.player-card').forEach(c => {
        c.classList.remove('pc-moving', 'pc-conflict');
    });

    // Update the current player's card
    const cardId = 'pc-' + step.event_id.replace(/[^a-zA-Z0-9]/g, '_');
    const card = document.getElementById(cardId);
    if (card) {
        const shortSlot = step.timeslot.replace(/\s*\(.*\)/, '');
        if (step.phase === 'greedy') {
            card.className = 'player-card pc-placed';
            card.querySelector('.pc-status').innerHTML =
                `<span class="pc-slot" style="background:${bg}44;color:${bg};">${shortSlot}</span> ` +
                (step.conflicts_after > 0
                    ? `<span style="color:#f85149;">&#9888; ${step.conflicts_after} conflict${step.conflicts_after>1?'s':''}</span>`
                    : '<span style="color:#3fb950;">&#10003;</span>');
        } else {
            card.className = 'player-card pc-moving';
            const delta = step.conflicts_before - step.conflicts_after;
            card.querySelector('.pc-status').innerHTML =
                `<span class="pc-slot" style="background:${bg}44;color:${bg};">${shortSlot}</span> ` +
                (delta > 0
                    ? `<span style="color:#3fb950;">&#8593; resolved ${delta} conflict${delta>1?'s':''}</span>`
                    : '<span style="color:#d29922;">&#8634; moved for better fit</span>');
        }
        // Payoff bar (rough: 0 conflicts = full bar)
        const barWidth = step.conflicts_after === 0 ? 100 : Math.max(10, 100 - step.conflicts_after * 30);
        card.querySelector('.pc-bar').style.width = barWidth + '%';
        card.querySelector('.pc-bar').style.background = step.conflicts_after > 0 ? '#f85149' : '#3fb950';

        // Scroll card into view
        card.scrollIntoView({behavior:'smooth', block:'nearest'});
    }

    // Mark conflict-involved players
    if (step.conflicts_after > 0) {
        // Find which events are in conflict at this timeslot
        if (ts) {
            const cell = document.getElementById(`anim-cell-${ts.day}-${ts.period}`);
            if (cell) {
                const eventsInCell = cell.querySelectorAll('[data-eid]');
                eventsInCell.forEach(el => {
                    const conflictCardId = 'pc-' + el.dataset.eid.replace(/[^a-zA-Z0-9]/g, '_');
                    const conflictCard = document.getElementById(conflictCardId);
                    if (conflictCard && conflictCard !== card) {
                        conflictCard.classList.add('pc-conflict');
                    }
                });
            }
        }
    }

    // Update bipartite graph and auction if visible
    bpAnimStep(step);
    auctionAnimStep(step);

    animState.stepIdx++;
}

function updateAnimScoreboard(stepNum, conflicts, placedSet, phase) {
    document.getElementById('anim-step-num').textContent = stepNum;
    document.getElementById('anim-phase').textContent = phase;
    document.getElementById('anim-conflicts').textContent = conflicts;
    document.getElementById('anim-conflicts').style.color = conflicts > 0 ? '#f85149' : '#3fb950';
    document.getElementById('anim-placed').textContent = placedSet.size;
    const total = animState.steps.length;
    document.getElementById('anim-progress').style.width = total > 0 ? (stepNum / total * 100) + '%' : '0%';
}

function animPlay() {
    if (animState.playing) return;
    animState.playing = true;
    const speedEl = document.getElementById('anim-speed');
    const getDelay = () => 1100 - (parseInt(speedEl.value) * 100); // 100ms to 1000ms
    (function tick() {
        if (!animState.playing || animState.stepIdx >= animState.steps.length) { animPause(); return; }
        animStep();
        animState.timer = setTimeout(tick, getDelay());
    })();
}

function animPause() {
    animState.playing = false;
    if (animState.timer) { clearTimeout(animState.timer); animState.timer = null; }
}

function animReset() {
    animPause();
    animState.stepIdx = 0;
    document.querySelectorAll('#anim-grid-wrap td').forEach(td => { td.innerHTML = ''; });
    document.getElementById('anim-log').innerHTML = '';
    const bpLog = document.getElementById('bp-log-overlay');
    if (bpLog) bpLog.innerHTML = '';
    document.getElementById('anim-narration').textContent = 'Click Play to watch the solver fill the timetable step by step.';
    updateAnimScoreboard(0, 0, new Set(), '—');
    // Reset player cards
    document.querySelectorAll('.player-card').forEach(card => {
        card.className = 'player-card pc-waiting';
        card.querySelector('.pc-status').innerHTML = '<span style="color:#484f58;">&#9679;</span> Waiting for slot...';
        card.querySelector('.pc-bar').style.width = '0%';
    });
    // Reset bipartite + auction
    bpReset();
    auctionReset();
}

document.getElementById('btn-play').addEventListener('click', animPlay);
document.getElementById('btn-pause').addEventListener('click', animPause);
document.getElementById('btn-step').addEventListener('click', () => { animPause(); animStep(); });
document.getElementById('btn-reset').addEventListener('click', animReset);

// (Sidebar removed — info is now in the bipartite graph overlay)

// Main view toggle (Grid / Bipartite / Auction)
document.querySelectorAll('.main-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.main-view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.mainview;
        document.getElementById('anim-grid-wrap').style.display = view === 'grid' && state.result ? '' : 'none';
        document.getElementById('bipartite-wrap').style.display = view === 'bipartite' && state.result ? '' : 'none';
        document.getElementById('auction-wrap').style.display = view === 'auction' && state.result ? '' : 'none';
        if (view === 'bipartite' && state.result) renderBipartite();
        if (view === 'auction' && state.result) renderAuction();
    });
});

// ─── Force-Directed Bipartite Stakeholder-Resource Graph ────────────────────
// Players = Teachers + Student Groups (circles with initials + satisfaction arcs)
// Resources = Timeslots (rounded rects with demand heatmap)
// Force layout spreads nodes naturally, click-to-highlight like conflict graph
let bpState = { nodes:[], links:[], sim:null, svg:null, nodeMap:{}, edgeSel:null, nodeSel:null,
                eventToLinkIds:{}, demandCount:{}, satisfactionData:{}, arcGen:null };

function renderBipartite() {
    if (!state.result || !state.inputData) return;
    document.getElementById('bipartite-wrap').style.display = '';
    const svgEl = document.getElementById('bipartite-svg');
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const rect = svgEl.getBoundingClientRect();
    const W = Math.max(rect.width, 400);
    const H = Math.max(rect.height, 300);
    svg.attr('viewBox', `0 0 ${W} ${H}`);

    const input = state.inputData;
    const eventInfo = animState.eventInfo || {};

    // Build all nodes: players + resources
    const nodes = [];
    const nodeMap = {};

    // Players
    (input.teachers||[]).forEach(t => {
        const n = {id:t.teacher_id, label:t.name||t.teacher_id, nodeType:'teacher',
            initials:(t.name||t.teacher_id).split(' ').map(w=>w[0]).join('').slice(0,2),
            color:'#58a6ff', fx:W*0.15, r:16};
        nodes.push(n); nodeMap[n.id] = n;
    });
    (input.student_groups||[]).forEach(g => {
        const n = {id:g.group_id, label:g.name||g.group_id, nodeType:'student_group',
            initials:(g.name||g.group_id).split(' ').map(w=>w[0]).join('').slice(0,2),
            color:'#3fb950', fx:W*0.15, r:16};
        nodes.push(n); nodeMap[n.id] = n;
    });

    // Resources (timeslots)
    const tsSet = new Set();
    (state.result.assignments||[]).forEach(a => tsSet.add(a.timeslot));
    (animState.steps||[]).forEach(s => { tsSet.add(s.timeslot); if(s.old_timeslot) tsSet.add(s.old_timeslot); });
    [...tsSet].sort().forEach(rid => {
        const n = {id:rid, label:rid.replace(/\s*\(.*\)/,''), nodeType:'resource',
            initials:'', color:'#484f58', fx:W*0.85, r:12};
        nodes.push(n); nodeMap[n.id] = n;
    });

    // Initial y positions — spread evenly within each type
    const playerNodes = nodes.filter(n=>n.nodeType!=='resource');
    const resNodes = nodes.filter(n=>n.nodeType==='resource');
    playerNodes.forEach((n,i) => { n.y = H*0.1 + i*(H*0.8)/Math.max(playerNodes.length-1,1); });
    resNodes.forEach((n,i) => { n.y = H*0.1 + i*(H*0.8)/Math.max(resNodes.length-1,1); });

    // Defs
    const defs = svg.append('defs');
    defs.append('filter').attr('id','glow').append('feGaussianBlur').attr('stdDeviation',3);

    // Link group
    const linkGroup = svg.append('g');
    // Think group
    const thinkGroup = svg.append('g').attr('class','bp-think');
    // Node group
    const nodeGroup = svg.append('g');

    // Satisfaction arc generator
    const arcGen = d3.arc().innerRadius(18).outerRadius(21).startAngle(0);

    // Draw nodes
    const gNodes = nodeGroup.selectAll('g.bp-node').data(nodes).join('g')
        .attr('class','bp-node').style('cursor','pointer');

    // Resource rectangles
    gNodes.filter(d=>d.nodeType==='resource').append('rect')
        .attr('x',-14).attr('y',-12).attr('width',28).attr('height',24)
        .attr('rx',6).attr('fill','#1a1f2e').attr('stroke','#30363d').attr('stroke-width',1.5)
        .attr('class','bp-resource-rect');
    // Resource demand bar
    gNodes.filter(d=>d.nodeType==='resource').append('rect')
        .attr('x',-12).attr('y',7).attr('width',0).attr('height',3)
        .attr('rx',1.5).attr('fill','#484f58').attr('class','bp-demand-bar');
    // Resource label
    gNodes.filter(d=>d.nodeType==='resource').append('text')
        .attr('x',20).attr('y',4).attr('text-anchor','start').attr('fill','#8b949e').attr('font-size',10)
        .text(d=>d.label);

    // Player satisfaction arc bg
    gNodes.filter(d=>d.nodeType!=='resource').append('circle')
        .attr('r',19).attr('fill','none').attr('stroke','#21262d').attr('stroke-width',3);
    // Player satisfaction arc
    gNodes.filter(d=>d.nodeType!=='resource').append('path')
        .attr('d',arcGen({endAngle:0})).attr('fill',d=>d.color).attr('class','bp-sat-arc');
    // Player circle
    gNodes.filter(d=>d.nodeType!=='resource').append('circle')
        .attr('r',d=>d.r).attr('fill',d=>d.color+'22').attr('stroke',d=>d.color).attr('stroke-width',2)
        .attr('class','bp-player-circle');
    // Player initials
    gNodes.filter(d=>d.nodeType!=='resource').append('text')
        .attr('y',4).attr('text-anchor','middle').attr('fill',d=>d.color).attr('font-size',11).attr('font-weight',700)
        .text(d=>d.initials);
    // Player name
    gNodes.filter(d=>d.nodeType!=='resource').append('text')
        .attr('x',-24).attr('y',4).attr('text-anchor','end').attr('fill',d=>d.color+'bb').attr('font-size',10)
        .text(d=>d.label.length>14?d.label.slice(0,13)+'…':d.label);
    // Nash checkmark (hidden)
    gNodes.filter(d=>d.nodeType!=='resource').append('text')
        .attr('x',22).attr('y',5).attr('font-size',14).attr('fill','#3fb950').attr('opacity',0)
        .attr('class','bp-nash-check').text('✓');

    // Force simulation — players pinned left, resources pinned right, y floats
    const sim = d3.forceSimulation(nodes)
        .force('y', d3.forceY(d => d.y).strength(0.3))
        .force('collide', d3.forceCollide(d => d.r + 4))
        .force('charge', d3.forceManyBody().strength(-20))
        .alphaDecay(0.05);

    sim.on('tick', () => {
        gNodes.attr('transform', d => {
            d.x = d.fx || d.x;
            d.y = Math.max(d.r+5, Math.min(H-d.r-5, d.y));
            return `translate(${d.x},${d.y})`;
        });
        // Update link positions from bpState.edges (not data-bound)
        Object.values(bpState.edges).forEach(e => {
            const s = nodeMap[e.playerId], t = nodeMap[e.resourceId];
            if (!s || !t || !e.path) return;
            const sx = (s.fx||s.x) + s.r, sy = s.y;
            const tx = (t.fx||t.x) - 14, ty = t.y;
            const mx = (sx+tx)/2;
            e.path.attr('d', `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`);
        });
    });

    // Click-to-highlight (like conflict graph)
    gNodes.on('click', (e, d) => {
        e.stopPropagation();
        // Find connected node IDs
        const connected = new Set([d.id]);
        Object.values(bpState.edges).forEach(edge => {
            if (edge.playerId === d.id) connected.add(edge.resourceId);
            if (edge.resourceId === d.id) connected.add(edge.playerId);
        });
        // Dim non-connected
        gNodes.attr('opacity', n => connected.has(n.id) ? 1 : 0.15);
        linkGroup.selectAll('.bp-link').attr('opacity', l => {
            return (l.source === d.id || l.target === d.id) ? 0.9 : 0.05;
        });
    });

    svg.on('click', () => {
        gNodes.attr('opacity', 1);
        linkGroup.selectAll('.bp-link').attr('opacity', 0.6);
    });

    // Store state
    bpState = { nodes, nodeMap, sim, svg, linkGroup, thinkGroup, gNodes,
                edges:{}, eventToLinkIds:{}, demandCount:{}, satisfactionData:{}, arcGen };
    nodes.filter(n=>n.nodeType==='resource').forEach(n => { bpState.demandCount[n.id] = 0; });
    nodes.filter(n=>n.nodeType!=='resource').forEach(n => { bpState.satisfactionData[n.id] = {total:0,count:0}; });

    // Replay edges
    for (let i = 0; i < animState.stepIdx; i++) {
        bpAddEventEdge(animState.steps[i].event_id, animState.steps[i].timeslot, '#8b949e');
    }
    bpUpdateDemandHeatmap();
    bpHighlightConflicts();
}

function bpAddEventEdge(eventId, tsStr, defaultColor) {
    const info = animState.eventInfo?.[eventId];
    if (!info) return;
    const courseColor = animState.colorScale?.(info.course_name||'') || defaultColor || '#8b949e';
    bpRemoveEventEdges(eventId);
    bpState.eventToLinkIds[eventId] = [];

    const addLink = (pid) => {
        if (!bpState.nodeMap[pid] || !bpState.nodeMap[tsStr]) return;
        const linkId = `${eventId}__${pid}`;
        const path = bpState.linkGroup.append('path')
            .attr('class','bp-link').attr('stroke',courseColor).attr('stroke-width',2)
            .attr('fill','none').attr('opacity',0).attr('data-lid',linkId);
        path.transition().duration(200).attr('opacity',0.6);
        bpState.edges[linkId] = {path, playerId:pid, resourceId:tsStr};
        bpState.eventToLinkIds[eventId].push(linkId);
    };

    addLink(info.teacher_id);
    (info.student_group_ids||[]).forEach(gid => addLink(gid));

    bpState.demandCount[tsStr] = (bpState.demandCount[tsStr]||0) + 1;

    // Trigger tick to redraw link positions
    if (bpState.sim) bpState.sim.alpha(0.1).restart();
}

function bpRemoveEdge(linkId) {
    const e = bpState.edges[linkId];
    if (e) { e.path.transition().duration(150).attr('opacity',0).remove(); delete bpState.edges[linkId]; }
}
function bpRemoveEventEdges(eid) {
    (bpState.eventToLinkIds[eid]||[]).forEach(lid => {
        const e = bpState.edges[lid];
        if (e) bpState.demandCount[e.resourceId] = Math.max(0,(bpState.demandCount[e.resourceId]||1)-1);
        bpRemoveEdge(lid);
    });
    bpState.eventToLinkIds[eid] = [];
}

// (E) Heatmap
function bpUpdateDemandHeatmap() {
    if (!bpState.svg) return;
    const maxD = Math.max(1, ...Object.values(bpState.demandCount));
    bpState.gNodes?.filter(d=>d.nodeType==='resource').select('.bp-resource-rect').each(function(d) {
        const intensity = (bpState.demandCount[d.id]||0) / maxD;
        const hue = 220-intensity*200, sat = 20+intensity*60;
        d3.select(this).transition().duration(200).attr('fill',`hsl(${hue},${sat}%,${15+intensity*10}%)`);
    });
    bpState.gNodes?.filter(d=>d.nodeType==='resource').select('.bp-demand-bar').each(function(d) {
        const intensity = (bpState.demandCount[d.id]||0) / maxD;
        d3.select(this).transition().duration(200).attr('width',intensity*24);
    });
}

// (C) Satisfaction
function bpUpdateSatisfaction(pid, payoff) {
    if (!bpState.satisfactionData[pid]) return;
    const sd = bpState.satisfactionData[pid];
    sd.total += Math.max(0, payoff); sd.count += 1;
    const frac = Math.min(1, Math.max(0, (sd.total/sd.count)*2));
    bpState.gNodes?.filter(d=>d.id===pid).select('.bp-sat-arc')
        .transition().duration(300)
        .attrTween('d', function() {
            const prev = d3.select(this).attr('d');
            return d3.interpolate(prev, bpState.arcGen({endAngle:frac*Math.PI*2}));
        });
}

// (A) Thinking
function bpShowThinking(step) {
    if (!bpState.thinkGroup || !step.alternatives?.length) return;
    bpState.thinkGroup.selectAll('*').remove();
    const info = animState.eventInfo?.[step.event_id];
    if (!info) return;
    const player = bpState.nodeMap[info.teacher_id];
    if (!player) return;
    const maxP = Math.max(...step.alternatives.map(a=>a.payoff),0.001);
    const minP = Math.min(...step.alternatives.map(a=>a.payoff));
    const range = maxP-minP||1;

    step.alternatives.forEach(alt => {
        const r = bpState.nodeMap[alt.timeslot];
        if (!r) return;
        const norm = (alt.payoff-minP)/range;
        const color = alt.conflicts>0?'#f85149':`hsl(${120*norm},70%,50%)`;
        const px = player.fx||player.x, py = player.y, rx = r.fx||r.x, ry = r.y;
        const mx = (px+rx)/2;
        bpState.thinkGroup.append('path')
            .attr('d',`M${px+16},${py} C${mx},${py} ${mx},${ry} ${rx-14},${ry}`)
            .attr('stroke',color).attr('stroke-width',1.5).attr('stroke-dasharray','4 3')
            .attr('opacity',0.3+norm*0.5).attr('fill','none');
        bpState.thinkGroup.append('text')
            .attr('x',rx-20).attr('y',ry-3).attr('text-anchor','end')
            .attr('fill',color).attr('font-size',9).attr('font-weight',600).text(alt.payoff.toFixed(1));
    });

    // Glow active player
    bpState.gNodes?.filter(d=>d.id===info.teacher_id).select('.bp-player-circle')
        .attr('filter','url(#glow)').attr('stroke-width',3);
}

function bpClearThinking() {
    if (bpState.thinkGroup) bpState.thinkGroup.selectAll('*').remove();
    bpState.gNodes?.filter(d=>d.nodeType!=='resource').select('.bp-player-circle')
        .attr('filter',null).attr('stroke-width',2);
}

function bpHighlightConflicts() {
    if (!bpState.svg) return;
    bpState.gNodes?.filter(d=>d.nodeType==='resource').select('.bp-resource-rect')
        .attr('stroke','#30363d').attr('stroke-width',1.5);

    const prCount = {};
    Object.entries(bpState.edges).forEach(([k,e]) => {
        const pk = e.playerId+'|'+e.resourceId;
        (prCount[pk]=prCount[pk]||[]).push(k);
    });
    Object.entries(prCount).forEach(([pk,keys]) => {
        if (keys.length >= 2) {
            const rid = pk.split('|')[1];
            bpState.gNodes?.filter(d=>d.id===rid).select('.bp-resource-rect')
                .attr('stroke','#f85149').attr('stroke-width',2.5);
            keys.forEach(k => {
                bpState.linkGroup?.select(`[data-lid="${k}"]`)
                    .attr('stroke','#f85149').attr('opacity',1).attr('stroke-width',2.5);
            });
        }
    });
}

function bpAnimStep(step) {
    if (!bpState.svg) return;
    const info = animState.eventInfo?.[step.event_id];
    bpShowThinking(step);
    setTimeout(() => {
        bpClearThinking();
        if (step.old_timeslot) {
            (bpState.eventToLinkIds[step.event_id]||[]).forEach(lid => {
                bpState.linkGroup?.select(`[data-lid="${lid}"]`)
                    .attr('stroke','#d29922').attr('stroke-dasharray','6 3');
            });
            setTimeout(() => {
                bpRemoveEventEdges(step.event_id);
                bpAddEventEdge(step.event_id, step.timeslot);
                bpUpdateDemandHeatmap(); bpHighlightConflicts();
            }, 150);
        } else {
            bpAddEventEdge(step.event_id, step.timeslot);
            bpUpdateDemandHeatmap(); bpHighlightConflicts();
        }
        if (info) {
            bpUpdateSatisfaction(info.teacher_id, step.payoff);
            (info.student_group_ids||[]).forEach(gid => bpUpdateSatisfaction(gid, step.payoff));
        }
    }, 150);
}

function bpNashSweep() {
    if (!bpState.gNodes) return;
    bpState.gNodes.filter(d=>d.nodeType!=='resource').select('.bp-nash-check').each(function(d, i) {
        d3.select(this).transition().delay(i*80).duration(200).attr('opacity',1);
    });
    bpState.gNodes.filter(d=>d.nodeType!=='resource').select('.bp-player-circle').each(function(d, i) {
        d3.select(this).transition().delay(i*80).duration(150).attr('stroke-width',3)
            .transition().duration(300).attr('stroke-width',2);
    });
}

function bpReset() {
    if (bpState.linkGroup) bpState.linkGroup.selectAll('*').remove();
    if (bpState.thinkGroup) bpState.thinkGroup.selectAll('*').remove();
    bpState.edges = {}; bpState.eventToLinkIds = {};
    if (bpState.gNodes) {
        bpState.gNodes.filter(d=>d.nodeType==='resource').select('.bp-resource-rect')
            .attr('stroke','#30363d').attr('stroke-width',1.5).attr('fill','#1a1f2e');
        bpState.gNodes.filter(d=>d.nodeType==='resource').select('.bp-demand-bar').attr('width',0);
        bpState.gNodes.filter(d=>d.nodeType!=='resource').select('.bp-nash-check').attr('opacity',0);
        bpState.gNodes.filter(d=>d.nodeType!=='resource').select('.bp-sat-arc')
            .attr('d', bpState.arcGen?.({endAngle:0})||'');
        bpState.gNodes.filter(d=>d.nodeType!=='resource').select('.bp-player-circle')
            .attr('filter',null).attr('stroke-width',2);
    }
    bpState.nodes?.filter(n=>n.nodeType==='resource').forEach(n=>{bpState.demandCount[n.id]=0;});
    bpState.nodes?.filter(n=>n.nodeType!=='resource').forEach(n=>{bpState.satisfactionData[n.id]={total:0,count:0};});
    // Reset opacity in case click-highlight was active
    bpState.gNodes?.attr('opacity',1);
    bpState.linkGroup?.selectAll('.bp-link').attr('opacity',0.6);
}

// ─── Auction House Visualization ────────────────────────────────────────────
let auctionState = { lots:[], slotOccupants:{}, initialized:false };

function renderAuction() {
    if (!state.result || !state.inputData) return;
    document.getElementById('auction-wrap').style.display = '';
    const input = state.inputData;
    const colorScale = animState.colorScale;

    // Build timeslot lot cards
    const tsSet = new Set();
    (state.result.assignments||[]).forEach(a => tsSet.add(a.timeslot));
    (animState.steps||[]).forEach(s => { tsSet.add(s.timeslot); if(s.old_timeslot) tsSet.add(s.old_timeslot); });
    const slots = [...tsSet].sort();

    auctionState.lots = slots;
    auctionState.slotOccupants = {};
    slots.forEach(s => { auctionState.slotOccupants[s] = []; });
    auctionState.initialized = true;

    // Render lot cards
    const lotsEl = document.getElementById('auction-lots');
    lotsEl.innerHTML = slots.map(s => {
        const label = s.replace(/\s*\(.*\)/,'');
        return `<div class="lot-card lot-neutral" id="lot-${s.replace(/[^a-zA-Z0-9]/g,'_')}">
            <div class="lot-slot">${label}</div>
            <div class="lot-payoff" style="color:#484f58;">—</div>
            <div class="lot-conflicts" style="color:#484f58;">Empty</div>
            <div class="lot-occupants"></div>
        </div>`;
    }).join('');

    // Reset bidder
    const bidderAvatar = document.getElementById('auction-bidder-avatar');
    bidderAvatar.textContent = '?';
    bidderAvatar.style.borderColor = '#484f58';
    bidderAvatar.style.color = '#8b949e';
    document.getElementById('auction-bidder-name').textContent = 'Waiting for bidder...';
    document.getElementById('auction-bidder-meta').textContent = 'Click Play to start the auction';
    document.getElementById('auction-round-badge').textContent = 'Round 0';
    document.getElementById('auction-ticker').innerHTML = '';
}

function auctionAnimStep(step) {
    if (!auctionState.initialized) return;
    const info = animState.eventInfo?.[step.event_id];
    if (!info) return;
    const colorScale = animState.colorScale;
    const courseColor = colorScale?.(info.course_name||'') || '#8b949e';
    const courseName = info.course_name || step.event_id;

    // ── Update bidder card ──
    const avatar = document.getElementById('auction-bidder-avatar');
    avatar.textContent = courseName.split(' ').map(w=>w[0]).join('').slice(0,2);
    avatar.style.borderColor = courseColor;
    avatar.style.color = courseColor;
    avatar.style.background = courseColor + '22';

    const isMove = step.phase === 'best_response';
    document.getElementById('auction-bidder-name').innerHTML =
        `<span style="color:${courseColor};">${courseName}</span>` +
        (isMove ? ' <span style="color:#d29922;font-size:12px;">RE-BIDDING</span>' : '');
    document.getElementById('auction-bidder-meta').textContent =
        `Teacher: ${info.teacher_id} | ${isMove ? 'Switching from '+step.old_timeslot?.replace(/\s*\(.*\)/,'') : 'Looking for a timeslot...'}`;
    document.getElementById('auction-round-badge').textContent =
        `Step ${animState.stepIdx + 1}`;

    // ── Update lot cards with payoff scores ──
    const alts = step.alternatives || [];
    const altMap = {};
    alts.forEach(a => { altMap[a.timeslot] = a; });

    // If moving, remove from old slot first
    if (step.old_timeslot && auctionState.slotOccupants[step.old_timeslot]) {
        auctionState.slotOccupants[step.old_timeslot] =
            auctionState.slotOccupants[step.old_timeslot].filter(e => e.id !== step.event_id);
    }

    // Reset all lot cards
    auctionState.lots.forEach(s => {
        const lotId = 'lot-' + s.replace(/[^a-zA-Z0-9]/g,'_');
        const el = document.getElementById(lotId);
        if (!el) return;
        const alt = altMap[s];
        const occupants = auctionState.slotOccupants[s] || [];
        const isChosen = s === step.timeslot;
        const hasConflict = alt ? alt.conflicts > 0 : false;

        // Payoff display
        const payoffEl = el.querySelector('.lot-payoff');
        if (alt) {
            const payoff = alt.payoff;
            const hue = Math.max(0, Math.min(120, ((payoff + 1) / 2) * 120)); // map payoff to 0-120 hue
            payoffEl.textContent = payoff.toFixed(1);
            payoffEl.style.color = hasConflict ? '#f85149' : `hsl(${hue},70%,55%)`;
        } else {
            payoffEl.textContent = '—';
            payoffEl.style.color = '#484f58';
        }

        // Conflict/status display
        const conflictEl = el.querySelector('.lot-conflicts');
        if (isChosen) {
            conflictEl.innerHTML = '<span class="gavel-anim">&#9881;</span> <strong>SOLD!</strong>';
            conflictEl.style.color = '#58a6ff';
            el.className = 'lot-card lot-won lot-winning';
        } else if (hasConflict) {
            conflictEl.innerHTML = `&#9888; ${alt.conflicts} conflict${alt.conflicts>1?'s':''}`;
            conflictEl.style.color = '#f85149';
            el.className = 'lot-card lot-conflict';
        } else if (alt) {
            conflictEl.textContent = 'Available';
            conflictEl.style.color = '#3fb950';
            el.className = 'lot-card lot-neutral';
        } else {
            conflictEl.textContent = occupants.length > 0 ? `${occupants.length} assigned` : 'Empty';
            conflictEl.style.color = '#484f58';
            el.className = 'lot-card lot-ghost';
        }

        // Show who's already in this slot
        const occEl = el.querySelector('.lot-occupants');
        occEl.innerHTML = occupants.map(o => {
            const c = colorScale?.(o.name||'') || '#8b949e';
            return `<span style="color:${c};font-size:10px;">&#9679;</span>`;
        }).join(' ');
    });

    // ── Add to slot occupants ──
    if (!auctionState.slotOccupants[step.timeslot]) auctionState.slotOccupants[step.timeslot] = [];
    auctionState.slotOccupants[step.timeslot].push({id:step.event_id, name:info.course_name});

    // ── Ticker entry ──
    const ticker = document.getElementById('auction-ticker');
    const delta = step.conflicts_before - step.conflicts_after;
    let tickerText = `<span style="color:${courseColor};">&#9679;</span> <strong>${courseName}</strong> `;
    if (isMove) {
        tickerText += `switched to ${step.timeslot.replace(/\s*\(.*\)/,'')}`;
        if (delta > 0) tickerText += ` <span style="color:#3fb950;">(-${delta} conflicts)</span>`;
    } else {
        tickerText += `won ${step.timeslot.replace(/\s*\(.*\)/,'')}`;
        if (step.conflicts_after > 0) tickerText += ` <span style="color:#f85149;">(${step.conflicts_after} conflicts)</span>`;
    }
    ticker.insertAdjacentHTML('afterbegin', `<div class="auction-ticker-entry">${tickerText}</div>`);
    while (ticker.children.length > 12) ticker.removeChild(ticker.lastChild);
}

function auctionComplete() {
    if (!auctionState.initialized) return;
    document.getElementById('auction-bidder-name').innerHTML =
        '<span style="color:#3fb950;">&#10003; Auction Complete — Nash Equilibrium</span>';
    document.getElementById('auction-bidder-meta').textContent = 'No bidder can improve by switching lots.';
    document.getElementById('auction-bidder-avatar').textContent = '&#10003;';
    document.getElementById('auction-bidder-avatar').style.borderColor = '#3fb950';
    document.getElementById('auction-bidder-avatar').style.color = '#3fb950';
    document.getElementById('auction-bidder-avatar').style.background = '#23863622';

    // Mark all lots as settled
    auctionState.lots.forEach(s => {
        const lotId = 'lot-' + s.replace(/[^a-zA-Z0-9]/g,'_');
        const el = document.getElementById(lotId);
        if (el) {
            el.className = 'lot-card lot-won';
            const conflictEl = el.querySelector('.lot-conflicts');
            if (conflictEl) { conflictEl.innerHTML = '&#10003; Settled'; conflictEl.style.color = '#3fb950'; }
        }
    });
}

function auctionReset() {
    auctionState.slotOccupants = {};
    auctionState.lots.forEach(s => { auctionState.slotOccupants[s] = []; });
    if (auctionState.initialized) renderAuction();
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
        if (renderedGeneration.solver !== state.generation) {
            renderedGeneration.solver = state.generation;
            renderSolverView();
        }
    }
    if (state.result && document.getElementById('tab-timetable').classList.contains('active')) {
        if (renderedGeneration.timetable !== state.generation) {
            renderedGeneration.timetable = state.generation;
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
            if (!formData.teachers.find(t => t.teacher_id === s.entity_id)) {
                formData.teachers.push({teacher_id:s.entity_id, name:s.entity_name||s.entity_id, max_hours_per_week:20});
                merged++;
            }
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
                    const course = formData.courses.find(fc => fc.course_id === c.course_id);
                    const hasSection = course.sections.some(sec => sec.teacher_id === s.entity_id);
                    if (!hasSection && course.sections.length > 0) {
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
            (s.preferences?.weights||[]).forEach(w => {
                if (w.weight > 0) {
                    const dayName = typeof w.day === 'string' ? w.day : '';
                    if (dayName && w.period) formData.timeslots.add(`${dayName}-${w.period}`);
                }
            });
        }

        // ── Merge timeslot preferences into solver input ──
        if (s.preferences && (s.preferences.weights||[]).length > 0) {
            // Remove any existing preference for this entity
            formData.preferences = (formData.preferences||[]).filter(p => p.entity_id !== s.entity_id);
            formData.preferences.push({
                entity_id: s.entity_id,
                entity_type: s.role === 'teacher' ? 'teacher' : 'student_group',
                weights: s.preferences.weights.map(w => ({
                    day: w.day, period: w.period, start_hour: w.start_hour,
                    start_minute: w.start_minute || 0, duration_minutes: w.duration_minutes || 60,
                    weight: w.weight
                })),
                room_weights: [],
                teacher_weights: [],
                course_weights: [],
            });
            merged++;
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

// ─── Weight sliders ─────────────────────────────────────────────────────────
['w-timeslot','w-teacher','w-course'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
        const a = parseInt(document.getElementById('w-timeslot').value)||0;
        const b = parseInt(document.getElementById('w-teacher').value)||0;
        const c = parseInt(document.getElementById('w-course').value)||0;
        document.getElementById('w-ts-val').textContent = a+'%';
        document.getElementById('w-teacher-val').textContent = b+'%';
        document.getElementById('w-course-val').textContent = c+'%';
        document.getElementById('w-total').textContent = (a+b+c)+'%';
    });
});

// ─── Init ───────────────────────────────────────────────────────────────────
if (!restoreState()) {
    loadSampleData();
}
