// ==UserScript==
// @name         Chinahrt 播放列表稳定修复版（终版）
// @version      2026.01.08.final
// @namespace    https://github.com/yikuaibaiban/chinahrt
// @description  一键添加未学完 + 播放页列表 + 跨域 iframe 自动播放 + 播完跳下一个
// @author       Elli Shum
// @match        https://gp.chinahrt.com/*
// @match        https://videoadmin.chinahrt.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

(function () {
    'use strict';

    /**************** 数据 ****************/
    const getCourses = () => GM_getValue('courses', []);
    const setCourses = v => GM_setValue('courses', v);
    const removeCourse = id => setCourses(getCourses().filter(c => c.sectionId !== id));

    /************************************************
     * 一、gp.chinahrt.com（课程页 + 播放页 UI）
     ************************************************/
    if (location.host === 'gp.chinahrt.com') {

        /******** 样式 ********/
        const style = document.createElement('style');
        style.textContent = `
        #sidebar,#videoPlaylist{position:fixed;top:80px;width:320px;max-height:80vh;overflow:auto;
        background:#fff;border:1px solid #ccc;box-shadow:0 0 8px rgba(0,0,0,.2);
        padding:10px;z-index:9999;font-family:Arial;border-radius:6px}
        #sidebar{left:10px}#videoPlaylist{right:10px}
        h2{font-size:15px;margin:6px 0}
        .item{display:flex;align-items:center;justify-content:space-between;font-size:13px;
        margin:4px 0;background:#f9f9f9;padding:5px;border-radius:4px}
        .item span{flex:1;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .item button{border:none;border-radius:3px;padding:2px 6px;cursor:pointer;color:#fff;background:#fd1952}
        .addBtn{background:#4bccf2!important}
        .addAll{width:100%;margin:6px 0;background:#4bccf2;color:#fff;
        border:none;border-radius:4px;padding:5px;cursor:pointer}
        `;
        document.head.appendChild(style);

        /******** 课程页侧边栏 ********/
        function renderSidebar(courseData) {
            let box = document.getElementById('sidebar');
            if (!box) {
                box = document.createElement('div');
                box.id = 'sidebar';
                document.body.appendChild(box);
            }

            box.innerHTML = `
                <h2>播放列表</h2>
                <div id="pl"></div>
                <button class="addAll">一键添加未学完课程</button>
                <h2>课程列表</h2>
                <div id="cl"></div>
            `;

            const pl = box.querySelector('#pl');
            const cl = box.querySelector('#cl');

            function refreshPL() {
                pl.innerHTML = '';
                getCourses().forEach(c => {
                    const d = document.createElement('div');
                    d.className = 'item';
                    d.innerHTML = `<span title="${c.sectionName}">${c.sectionName}</span><button>移除</button>`;
                    d.querySelector('span').onclick = () => location.href = c.url;
                    d.querySelector('button').onclick = () => {
                        removeCourse(c.sectionId);
                        refreshPL(); refreshCL();
                    };
                    pl.appendChild(d);
                });
            }

            function refreshCL() {
                cl.innerHTML = '';
                courseData.forEach(c => {
                    const added = getCourses().some(x => x.sectionId === c.sectionId);
                    const d = document.createElement('div');
                    d.className = 'item';
                    d.innerHTML = `<span title="${c.sectionName}">${c.sectionName}</span>
                                   <button class="addBtn">${added ? '移除' : '添加'}</button>`;
                    d.querySelector('span').onclick = () => location.href = c.getUrl();
                    d.querySelector('button').onclick = () => {
                        if (added) removeCourse(c.sectionId);
                        else setCourses([...getCourses(), { ...c, url: c.getUrl() }]);
                        refreshPL(); refreshCL();
                    };
                    cl.appendChild(d);
                });
            }

            box.querySelector('.addAll').onclick = () => {
                const list = getCourses();
                courseData.forEach(c => {
                    if (c.study_status !== '已学完' &&
                        !list.some(x => x.sectionId === c.sectionId)) {
                        list.push({ ...c, url: c.getUrl() });
                    }
                });
                setCourses(list);
                refreshPL(); refreshCL();
            };

            refreshPL(); refreshCL();
            GM_addValueChangeListener('courses', refreshPL);
        }

        /******** 播放页右侧列表 ********/
        function renderVideoList() {
            if (!location.href.includes('v_video')) return;
            const list = getCourses();
            if (!list.length) return;

            let box = document.getElementById('videoPlaylist');
            if (!box) {
                box = document.createElement('div');
                box.id = 'videoPlaylist';
                document.body.appendChild(box);
            }

            box.innerHTML = '<h2>播放列表</h2>';
            list.forEach(c => {
                const d = document.createElement('div');
                d.className = 'item';
                d.innerHTML = `<span>${c.sectionName}</span><button>移除</button>`;
                d.querySelector('span').onclick = () => location.href = c.url;
                d.querySelector('button').onclick = e => {
                    e.stopPropagation();
                    removeCourse(c.sectionId);
                    renderVideoList();
                };
                box.appendChild(d);
            });
        }

        /******** 自动播放指令（父 → iframe） ********/
        function sendPlay() {
            const iframe = document.querySelector('iframe');
            if (!iframe?.contentWindow) return;
            iframe.contentWindow.postMessage({ cmd: 'PLAY' }, 'https://videoadmin.chinahrt.com');
        }

        let lastSectionId = null;
        setInterval(() => {
            if (!location.href.includes('v_video')) return;
            const p = new URLSearchParams(location.hash.split('?')[1] || '');
            const sid = p.get('sectionId');
            if (!sid || sid === lastSectionId) return;
            lastSectionId = sid;

            let i = 0;
            const t = setInterval(() => {
                sendPlay();
                if (++i > 10) clearInterval(t);
            }, 800);
        }, 500);

        setTimeout(sendPlay, 3000);

        /******** 抓课程 ********/
        const open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener('load', () => {
                if (!this.responseURL.includes('courseDetail')) return;
                let r; try { r = JSON.parse(this.response); } catch { return; }
                if (!r?.data?.course) return;

                const list = [];
                r.data.course.chapter_list.forEach(ch =>
                    ch.section_list.forEach(s => {
                        list.push({
                            courseId: r.data.courseId,
                            trainplanId: r.data.trainplanId,
                            sectionId: s.id,
                            sectionName: s.name,
                            study_status: s.study_status,
                            getUrl() {
                                const p = /platformId=(\d+)/.exec(location.href)?.[1];
                                return `https://${location.host}/index.html#/v_video?platformId=${p}&trainplanId=${this.trainplanId}&courseId=${this.courseId}&sectionId=${this.sectionId}&sectionName=${encodeURIComponent(this.sectionName)}`;
                            }
                        });
                    })
                );
                renderSidebar(list);
            });
            return open.apply(this, arguments);
        };

        renderVideoList();
        GM_addValueChangeListener('courses', renderVideoList);
    }

    /************************************************
     * 二、videoadmin.chinahrt.com（真正播放）
     ************************************************/
    if (location.host === 'videoadmin.chinahrt.com') {

        function tryPlay() {
            const v = document.querySelector('video');
            if (!v || !v.paused) return;
            v.muted = true;
            v.play().catch(() => {});
        }

        window.addEventListener('message', e => {
            if (e.data?.cmd === 'PLAY') tryPlay();
        });

        const timer = setInterval(() => {
            const v = document.querySelector('video');
            if (!v) return;
            clearInterval(timer);
            tryPlay();

            v.addEventListener('ended', () => {
                let list = getCourses();
                if (!list.length) return;

                list.shift();
                setCourses(list);

                setCourses(list);

                // 自动播放下一个（如果还有）
                if (list.length) {
                    parent.location.href = list[0].url;
                }
            });
        }, 800);
    }
})();
