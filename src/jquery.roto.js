/*!
 * Roto @VERSION
 * http://github.com/rdallasgray/roto
 * 
 * A simple, flexible, touch-capable scrolling plugin for jQuery
 * 
 * Copyright @YEAR Robert Dallas Gray. All rights reserved.
 * Provided under the FreeBSD license: https://github.com/rdallasgray/roto/blob/master/LICENSE.txt
*/
(function($) {
    $.fn.roto = function(options) {
        var defaults = {
                btnPrev: ".prev",
                btnNext: ".next",
                direction: "h",
                shift_duration: 200,
                shift_bezier: [0, 0, 0, 1],
                drift_duration: 1800,
                drift_factor: 500,
                drift_bezier: [0, 0, 0.3, 1],
                bounce_duration: 400,
                bounce_bezier: [0, 0.5, 0.5, 1],
                pull_divisor: 1.7,
                timer_interval: 50,
                disable_transitions: false,
                startOffset: 0,
                endOffset: 0,
                snap: true
            },
            options = $.extend(defaults, options || {}),
        
            msToS = 1000,
            
            coOrdRef = "client",

            isTouchDevice = (function() {
                try {
                    document.createEvent("TouchEvent");
                    return true;
                } catch (e) {
                    return false;
                }
            }()),
                
            // names of events are dependent on whether device uses touch events
            scrollEvents = isTouchDevice ?
                { start: "touchstart", move: "touchmove", end: "touchend" } :
                { start: "mousedown", move: "mousemove", end: "mouseup" },

            // get the correct scroll events for touch and desktop devices
            wrapScrollEvent = function(e) {
                if (isTouchDevice && typeof e.originalEvent.touches !== "undefined") {
                    return e.originalEvent.touches[0];
                }
                return e;
            },

            transformProp = null, transitionProp = null, transitionEvent = null, transitionStr = null,
            
            // names of dimensions are dependent on whether the roto is horizontal or vertical
            orientations = { 
                h: { measure: "Width", offsetName: "left", coOrd: "X" },
                v: { measure: "Height", offsetName: "top", coOrd: "Y" }
            },
            dimensions = orientations[options.direction];

            
        // get correct transition css properties and events, if supported
        if (!options.disable_transitions) {
            var body = document.body || document.documentElement,
                transform = {
                    transform: "transform", 
                    MozTransform: "-moz-transform", 
                    WebkitTransform: "-webkit-transform"
                },
                transition = {
                    transition: { prop: "transition", "event": "transitionend" },
                    MozTransition: { prop: "-moz-transition", "event": "transitionend" },
                    WebkitTransition: { prop: "-webkit-transition", "event": "webkitTransitionEnd" }
                };
            for (var i in transform) {
                if (typeof body.style[i] !== "undefined") {
                    transformProp = transform[i];
                    break;
                }
            }
            for (var i in transition) {
                if (typeof body.style[i] !== "undefined") {
                    transitionProp = transition[i].prop, transitionEvent = transition[i].event;
                    break;
                }
            }
        }
        
        var usingTransitions = transitionProp !== null;
        
        return this.each(function() {
            var // the element containing the buttons and ul
                container = $(this),
                // the ul containing the elements to be rotoed, and a cache of its li subelements
                ul = container.find("ul").first(), listItems = ul.children("li"),
                // the offset measured before the ul is moved (to prevent problems in IE7)
                offsetCorrection = 0,
                // the maximum offset from starting position that the roto can be moved
                maxOffset = options.startOffset,
                // the minimum offset from starting position that the roto can be moved (to be calculated below)
                minOffset = 0,
                // the offset to pointer tracking
                trackingOffset = 0,
                // the last non-zero direction of travel measured
                lastValidDir = -1,
                // the inner width or height of the container element
                containerMeasure = 0,
                // the total width or height of the contents of the ul element
                rotoMeasure = 0,
                // unique identification of the overall container, to be used in namespacing events
                containerId = (typeof container.attr("id") !== undefined) ? container.attr("id") : "roto" + new Date().getTime(),
                // if transforms are supported, the string giving the css property to be animated
                animatedProp = null,
                // look-up table for css transition properties
                transitionLUT = null,
                // current state of the roto as regards animations etc.
                states = { ready: "ready", tracking: "tracking", drifting: "drifting", shifting: "shifting", bouncing: "bouncing" },
                state = states.ready,
                // whether the rotoChange event has already been primed
                changeEventPrimed = false,
                // cache of the previous and next button elements
                prevButton = container.find(options.btnPrev), nextButton = container.find(options.btnNext),
                // whether we're using the prev and next buttons
                buttonsUsed = null;
                
            // support both jQuery.animate and css transitions
            var doAnimation = function(element, css, duration, easing, callback) {
                    var _callback = callback;
                    // don't add a change notification to the callback if one has already been added --
                    // unless we're not using css transitions, in which case do
                    if (!changeEventPrimed || !usingTransitions) {
                        _callback = function() {
                            notifyChanged();
                            callback();
                        }
                        changeEventPrimed = true;
                    }
                    if (usingTransitions) {
                        var LUT = getTransitionLUT();
                        if (LUT.timingFunction[easing] === undefined) {
                            LUT.timingFunction[easing] = ["cubic-bezier(", options[easing + "_bezier"].join(","), ")"].join("");
                        }
                        // construct a simple object to set as CSS props
                        var opt = {};
                        opt[LUT.durationProp] = duration/msToS + "s";
                        opt[LUT.timingFunctionProp] = transitionLUT.timingFunction[easing];
                        element.css(opt);
                        
                        // store the callback as data to use in case animation is stopped
                        element.data("animationCallback", _callback);
                        // and bind it to the transitionEvent, to run if animation completes
                        element.unbind(transitionEvent);
                        element.one(transitionEvent, function() {
                            element.data("animationCallback", null);
                            _callback();
                        });
                        //finally, set the new css properties to initiate the transition
                        element.css(css);
                    }
                    else {
                        // we're not using transitions -- use jQuery.animate instead
                        element.animate(css, duration, $.bez(options[easing + "_bezier"]), _callback);
                    }
                },
                stopAnimation = function(element) {
                    if (usingTransitions) {
                        var offset = getCurrentOffset();
                        element.unbind(transitionEvent);
                        element.css(getAnimatedProp(offset));
                        // run the callback stored in the element's data, then remove it
                        if (typeof element.data("animationCallback") === "function") {
                            element.data("animationCallback")();
                            element.data("animationCallback", null);
                        }
                    }
                    else {
                        // using jQuery.animate, so stop() will work fine
                        element.stop();
                    }
                },
                getTransitionLUT = function() {
                    // build the transition LUT if necessary
                    if (transitionLUT === null) {
                        transitionLUT = {
                            durationProp: transitionProp + "-duration",
                            timingFunctionProp: transitionProp + "-timing-function",
                            timingFunction: {}
                        };
                    }
                    return transitionLUT;
                },
                
                // get the css property to animate based on whether transforms are supported
                getAnimatedProp = function(move) {
                    var opt = {};
                    if (usingTransitions) {
                        if (animatedProp === null) {
                            var use3d = isTouchDevice ? "3d" : "",
                                translateStr = (use3d === "3d") ? "(Xpx,Ypx,0px)" : "(Xpx,Ypx)",
                                oppositeCoOrd = { X: "Y", Y: "X"};
                            animatedProp = ["translate", use3d, 
                                translateStr.replace(oppositeCoOrd[dimensions.coOrd], "0")].join("");
                        }
                        opt[transformProp] = animatedProp.replace(dimensions.coOrd, move);
                    }
                    else {
                        opt[dimensions.offsetName] = move + "px";
                    }
                    return opt;
                },
                
                // get the current offset position of the ul, dependent on whether transforms are supported
                getCurrentOffset = function() {
                    if (!usingTransitions) return ul.position()[dimensions.offsetName] - offsetCorrection;
                    
                    var transformStr = ul.css(transformProp),
                        matches = transformStr.match(/\-?[0-9]+/g);

                    var val = (dimensions.coOrd === 'X') ? matches[4] : matches[5];
                    return parseInt(val);
                },
                
                // find the list element nearest the given offset, and its position
                getNearestListItemTo = function(offset, dir) {
                    var pos = maxOffset, extent, bound,
                        lis = (dir > 0) ? listItems.get().reverse() : listItems,
                        li, _el, measure = "outer" + dimensions.measure;
                    $.each(lis, function(idx, el) {
                        _el = $(el);
                        // set pos to the position of the current listItem
                        pos = -1 * Math.ceil(_el.position()[dimensions.offsetName]);
                        li = el;
                        if (dir < 0) {
                            pos -= options.startOffset;
                            extent = (-1 * pos) + _el[measure](true);
                            bound = -1 * offset;
                        }
                        else {
                            pos += options.endOffset;
                            extent = _el.prev().length > 0 ? pos + _el.prev()[measure](true) : pos;
                            bound = offset;
                        }
                        // if the position is beyond the offset, break the loop
                        if (pos * dir >= offset * dir || extent > bound) {
                            return false;
                        }
                    });
                    return [li, pos];
                },
                
                // find the next (by direction) listitem to the given offset
                getNextListItemTo = function(offset, dir) {
                    var func = dir < 0 ? "next" : "prev",
                        curr = $(getNearestListItemTo(offset, dir)[0]),
                        next = curr;
                    do {
                        next = next[func]();
                    } while(next.length > 0 && next.position()[dimensions.offsetName] === curr.position()[dimensions.offsetName])
                    return next;
                },
                
                // get the position of the listitem nearest the given offset
                getSnapMove = function(offset, dir, next) {
                    var dir = (dir === 0) ? lastValidDir : dir;
                    return next ? 
                        -1 * Math.ceil(getNextListItemTo(offset, dir).position()[dimensions.offsetName]) 
                        : getNearestListItemTo(offset, dir)[1];
                },
                
                // is the roto already snapped to a listitem?
                isSnapped = function() {
                    var offset = getCurrentOffset();
                    return offset === getSnapMove(offset, lastValidDir, false);
                },
                
                // trigger event on completion of move
                notifyChanged = function() {
                    container.trigger("rotoChange", [getNearestListItemTo(getCurrentOffset(), 1)[0]]);
                    changeEventPrimed = false;
                },
                
                // remeasure the container and derive the minimum offset allowed
                // the minimum offset is the total measure of the listItems - the measure of the ul
                remeasure = function() {
                    // measure the total width or height of the elements contained in the ul
                    // if roto is horizontal, we have to individually measure each listItem
                    rotoMeasure = 0;
                    listItems = ul.children("li");
                    listItems.css({ display: "block", "float": "left", listStyle: "none" });
                    if (options.direction === 'h') {
                        // for each element, add the outer dimension of the element including margin and padding
                        listItems.each(function(idx, el) {
                            rotoMeasure += Math.ceil($(el)["outer"+dimensions.measure](true));
                        });
                        // set the dimension of the ul to what we measured, just to be sure
                        ul[dimensions.measure.toLowerCase()](rotoMeasure);
                    }
                    else {
                        // if roto is vertical we can use a simpler method to calculate size:
                        // just find the position of the last element and add its outer dimension, including margin and padding
                        var last = listItems.last();
                        rotoMeasure = Math.round($(last).position()[dimensions.offsetName] + $(last)["outer"+dimensions.measure](true));
                    }
                    containerMeasure = Math.ceil(container[dimensions.measure.toLowerCase()]()),
                    minOffset = Math.ceil(rotoMeasure - containerMeasure + offsetCorrection + options.endOffset) * -1;
                    if (options.snap) {
                        var offset = getSnapMove(minOffset, -1, false);
                        // check if the offset we got is less than the non-snap minOffset; if so, use the offset of the next listelement
                        minOffset = offset > minOffset ? getSnapMove(minOffset, -1, true) : offset;
                    }
                },
                
                // check if prev & next buttons are being used
                usingButtons = function() {
                    if (buttonsUsed === null) {
                        buttonsUsed = (typeof prevButton === "object" && typeof prevButton.click === "function")
                        && (typeof nextButton === "object" && typeof nextButton.click === "function");
                    }
                    return buttonsUsed;
                },
                
                // enable or disable the previous and next buttons based on roto conditions
                switchButtons = function() {
                    if (!usingButtons()) return;
                    // if the total measure of the listItems extends beyond the end of the ul, enable the next button
                    if (rotoMeasure > (containerMeasure - getCurrentOffset())) {
                        nextButton.removeAttr("disabled");
                    }
                    else nextButton.attr("disabled", "disabled");

                    // if the listItems are offset beyond the start of the ul, enable the previous button
                    if (getCurrentOffset() < maxOffset) {
                        prevButton.removeAttr("disabled");
                    }
                    else prevButton.attr("disabled", "disabled");
                },
                
                // respond to a goto event
                rotoGoto = function(data) {
                    var type = typeof data;
                    switch(type) {
                        case "number":
                        gotoNumber(data);
                        break;
                        case "object":
                        gotoElement(data);
                        break;
                        case "string":
                        gotoNext(data);
                        break;
                    }
                },
                
                // goto a numbered element
                gotoNumber = function(num) {
                    if (num < 0 || num >= listItems.length) return;
                    var el = $(listItems.get(num));
                    gotoElement(el);
                },
                
                // goto an element
                gotoElement = function(el) {
                    gotoOffset(-1 * el.position()[dimensions.offsetName] + options.startOffset);
                },
                
                // goto an offset
                gotoOffset = function(offset) {
                    doAnimation(ul, getAnimatedProp(offset), options.shift_duration, "shift", function() {
                        switchButtons();
                        state = states.ready;
                    });
                },
                
                // goto prev or next
                gotoNext = function(dirStr) {
                    if (dirStr !== "prev" && dirStr !== "next") return;
                    dir = (dirStr === "prev") ? 1 : -1;
                    gotoElement(getNextListItemTo(getCurrentOffset(), dir));
                },
                
                // shift the listItems one ul width in the given direction
                rotoShift = function(dir) {
                    var move = 0;
                    // do nothing if the animation is already running
                    if (state === states.shifting) return;
                    state = states.shifting;
                    lastValidDir = dir;

                    // internal function to move the listitems by the calculated amount
                    var doShift = function(move) {
                        doAnimation(ul, getAnimatedProp(move), options.shift_duration, "shift", function() {
                            switchButtons();
                            state = states.ready;
                        });
                    };

                    if (dir < 0) {
                        // if we're moving forwards, find the element nearest the end of the container
                        move = Math.max(getSnapMove(getCurrentOffset() - containerMeasure + options.startOffset, dir, false), minOffset);
                    }
                    else {
                        // if we're moving backwards, find the element one container width towards the start of the container
                        move = Math.min(getSnapMove(getCurrentOffset() + containerMeasure - options.endOffset, dir, false), maxOffset);
                    }
                    // move the offsetElement to the start of the container
                    gotoOffset(move);
                },
                
                // track the ul to movement of the pointer
                rotoTrack = function(pointerMove) {
                    var drag = Math.ceil(pointerMove + trackingOffset),
                        move;
                    // allow user to pull the ul beyond the max/min offsets
                    if (drag < (maxOffset) && drag > (minOffset)) {
                        move = drag;
                    }
                    else {
                        var diff = (drag > maxOffset) ? drag - maxOffset : drag - minOffset,
                            move = drag - diff/options.pull_divisor;
                    }
                    if (state !== states.tracking) {
                        var opt = {}, LUT = getTransitionLUT();
                        opt[LUT.durationProp] = "0s";
                        opt[LUT.timingFunctionProp] = "none";
                        ul.css(opt);
                    }
                    state = states.tracking;
                    ul.css(getAnimatedProp(move));
                },
                
                // continue ul movement inertially based on pointer speed
                rotoDrift = function() {
                    var speed_dir = timer.getPointerSpeed(),
                        speed = speed_dir[0], dir = speed_dir[1],
                        cOffset = getCurrentOffset();

                    // distance to rotoDrift
                    var distance = speed * options.drift_factor * dir, 
                        move = distance + cOffset;
                    if (move > maxOffset) move = maxOffset;
                    else if (move < minOffset) move = minOffset;
                    else if (options.snap && !isSnapped()) {
                        move = getSnapMove(move, dir, true);
                    }
                    if (move === cOffset) {
                        notifyChanged();
                        return;
                    }
                    state = states.drifting;
                    doAnimation(ul, getAnimatedProp(move), options.drift_duration, "drift", function() {
                        state = states.ready;
                        switchButtons();
                    });
                },
                
                // bounce the ul elastically after it's pulled beyond max or min offsets
                bounceBack = function(dir) {
                    var end = (dir < 0) ? minOffset : maxOffset;
                    state = states.bouncing;
                    doAnimation(ul, getAnimatedProp(end), options.bounce_duration, "bounce", function() {
                        state = states.ready;
                        switchButtons();
                    });
                },
                
                // timer to calculate speed of pointer movement
                timer = (function() {
                    var startCoOrd = 0, currentCoOrd = 0, initialCoOrd = 0,
                        chunker = null,
                        chunk = { startCoOrd: 0, endCoOrd: 0 };
                
                    return {
                        start: function() {
                            initialCoOrd = startCoOrd = currentCoOrd;
                            //only measure speed in the final 50ms of movement
                            chunker = window.setInterval(function() {
                                chunk.startCoOrd = startCoOrd;
                                chunk.endCoOrd = currentCoOrd;
                                startCoOrd = currentCoOrd;
                            }, options.timer_interval);
                        },
                        stop: function() {
                            clearInterval(chunker);
                            chunk.endCoOrd = currentCoOrd;
                        },
                        getPointerSpeed: function() {
                            var translation = chunk.endCoOrd - chunk.startCoOrd,
                                 distance = Math.abs(translation),
                                speed = distance/options.timer_interval,
                                dir_value = (translation === 0) ? chunk.endCoOrd - initialCoOrd : translation,
                                dir = (dir_value <= 0) ? ((dir_value === 0) ? 0 : -1) : 1;
                            if (dir !== 0) lastValidDir = dir;
                            return [speed, dir];
                        },
                        setCurrentCoOrd: function(coOrd) {
                            currentCoOrd = coOrd;
                        }
                    }
                }()),
                
                // boot or reboot the roto
                boot = function() {
                    remeasure();
                    switchButtons();
                };

            // prevent webkit flicker    
            if (transitionProp === "-webkit-transition") ul.css("-webkit-backface-visibility", "hidden");

            // set required styles
            container.css({ overflow: "hidden", position: "relative" });
            ul.css({ position: "relative", padding: 0, margin: 0 });

            // move the ul to startOffset            
            ul.css(getAnimatedProp(options.startOffset));

            // if prev/next buttons don't seem to be inside the container, look for them outside
            if (prevButton.length === 0 && options.btnPrev === defaults.btnPrev) {
                if (container.attr("id")) {
                    prevButton = $("#"+container.attr("id")+"-prev");
                    nextButton = $("#"+container.attr("id")+"-next");
                }
            }

            // remeasure everything on window resize, in case there are fluid elements involved
            $(window).resize(function() {
                boot();
            });

            // bind scroll events
            ul.bind(scrollEvents.start + ".roto." + containerId, function(e) {
                state = states.ready;
                trackingOffset = getCurrentOffset();
                stopAnimation(ul);
                var linkElements = ul.find("a"),
                    oldLinkEvents = {};

                if (!isTouchDevice) {
                    e.preventDefault(); // prevent drag behaviour
                    if (document.ondragstart !== undefined) {
                        ul.find("a, img").one("dragstart", function(f) { f.preventDefault(); });
                    }
                    if (linkElements.length > 0) {
                        $(document).one(scrollEvents.move + ".roto." + containerId, function(f) {
                            // intially prevent link elements responding to clicks at start of ul tracking
                            linkElements.one("click.roto." + containerId, function(f) { f.preventDefault(); });
                            // gather any events attached to linkElements before unbinding
                            $.each(linkElements.data('events'), function(eventName, events) {
                                oldLinkEvents[eventName] = [];
                                $.each(events, function(i, event) {
                                    oldLinkEvents[eventName].push(event);
                                });
                            });
                            // prevent linkElements responding to other events during ul tracking
                            linkElements.unbind();
                            // prevent linkElements responding to clicks during ul tracking
                            linkElements.bind("click.roto." + containerId, function(g) {
                                g.preventDefault();
                            });
                        });
                    }
                }
                e = wrapScrollEvent(e);
                var startCoOrd = e[coOrdRef+dimensions.coOrd];
                timer.setCurrentCoOrd(startCoOrd);

                // scrolling has started, so begin tracking pointer movement and measuring speed
                $(document).bind(scrollEvents.move + ".roto." + containerId, function(f) {
                    f.preventDefault();
                    f = wrapScrollEvent(f);
                    timer.setCurrentCoOrd(f[coOrdRef+dimensions.coOrd]);
                    rotoTrack(f[coOrdRef+dimensions.coOrd] - startCoOrd);
                });
                
                // user stopped scrolling
                $(document).one(scrollEvents.end, function() {
                    timer.stop();
                    if (getCurrentOffset() > maxOffset || getCurrentOffset() < minOffset) {
                        bounceBack(getCurrentOffset() - maxOffset);
                    }
                    else {
                        rotoDrift();
                    }
                    $(document).unbind(scrollEvents.move + ".roto." + containerId);
                    if (!isTouchDevice && linkElements.length > 0) {
                        window.setTimeout(function() {
                            // reattach old events to linkElements after a short delay
                            linkElements.unbind("click.roto." + containerId);
                            $.each(oldLinkEvents, function(eventName, events) {
                                $.each(events, function(f, event) {
                                    linkElements.bind(event.type + "." + event.namespace, event.data, event.handler);
                                });
                            });
                        }, 250);
                    }
                });
                timer.start();
            });

            // bind button presses
            if (usingButtons()) {
                prevButton.click(function() {
                    return rotoShift(1);
                });
                nextButton.click(function() {
                    return rotoShift(-1);
                });
            }

            // let's get started
            container.bind("rotoGoto", function(e, d) { rotoGoto(d); });
            container.bind("rotoShift", function(e, d) { rotoShift(d); });
            container.bind("rotoContentChange", function() { boot(); });
            boot();

            // make IE7 sane
            offsetCorrection = Math.ceil(getCurrentOffset());
            if (offsetCorrection !== 0) remeasure();
        });
    }
})(jQuery);

