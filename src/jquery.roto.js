/*!
 * Roto @VERSION
 * http://github.com/rdallasgray/roto
 * 
 * A simple, flexible, touch-capable scrolling plugin for jQuery
 * 
 * Copyright @YEAR Robert Dallas Gray. All rights reserved.
 * Provided under the FreeBSD license: https://github.com/rdallasgray/roto/blob/master/LICENSE.txt
 */
(function($, window, document, undefined) {
    
    /***        SET UP OVERALL OPTIONS AND DEFAULTS FOR ALL MATCHED ELEMENTS       ***/

    $.fn.roto = function(options) {
        var defaults = {
            rotoSelector: ".rotoFrame",
            btnPrev: ".prev",
            btnNext: ".next",
            btnAction: "shift",
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
            snap: true,
            clickables: "a, img",
            auto_disable: true
        },
        options = $.extend(defaults, options || {}),
        
        // constant to translate milliseconds to seconds
        msToS = 1000,
        
        // could be "client" or "screen"
        coOrdRef = "client",

        // use touch events?
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
        
        // names of dimensions are dependent on whether the roto is horizontal or vertical
        orientations = { 
            h: { measure: "Width", offsetName: "left", coOrd: "X", opp: "v" },
            v: { measure: "Height", offsetName: "top", coOrd: "Y", opp: "h" }
        },
        dimensions = orientations[options.direction],
        
        // set up properties and events for css transforms and transitions
        transformProp = null, transitionProp = null, transitionEvent = null, transitionStr = null;

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
        
        var usingTransitions = (transitionProp !== null);

        
        
        /***        SET UP ENVIRONMENTAL VARIABLES AND METHODS FOR EACH MATCHED ELEMENT       ***/

        return this.each(function() {
            var // the element containing the buttons and ul
            container = $(this),
            // the element containing the elements to be rotoed, and a cache of its child elements
            rotoFrame = container.children(options.rotoSelector).length > 0 ? 
                container.children(options.rotoSelector).first() : 
                container.children("ul").length > 0 ? container.children("ul").first() : container.children().first(), 
            rotoKids = rotoFrame.children(),
            // the offset measured before the rotoFrame is moved (to prevent problems in IE7)
            offsetCorrection = 0,
            // the maximum offset from starting position that the roto can be moved
            maxOffset = 0,
            // the minimum offset from starting position that the roto can be moved (to be calculated below)
            minOffset = 0,
            // the offset to pointer tracking
            trackingOffset = 0,
            // the last non-zero direction of travel measured
            lastValidDir = -1,
            // the inner width or height of the container element
            containerMeasure = 0,
            // the total width or height of the contents of the rotoFrame element
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
            buttonsUsed = null,
            // whether scrolling is currently enabled
            scrollingEnabled = true;



            /***                LOW-LEVEL ANIMATION FUNCTIONS               ***/
            
            // support both jQuery.animate and css transitions
            var doAnimation = function(element, css, easing, callback) {
                var _callback = callback, duration = options[easing + "_duration"];
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
                        oppCoOrd = orientations[dimensions.opp].coOrd;
                        animatedProp = ["translate", use3d, 
                                        translateStr.replace(oppCoOrd, "0")].join("");
                    }
                    opt[transformProp] = animatedProp.replace(dimensions.coOrd, move);
                }
                else {
                    opt[dimensions.offsetName] = move + "px";
                }
                return opt;
            },



            /***                FINDING OFFSETS             ***/
            
            // get the current offset position of the rotoFrame, dependent on whether transforms are supported
            getCurrentOffset = function() {
                var offset;
                if (!usingTransitions) {
                    offset = rotoFrame.position()[dimensions.offsetName] - offsetCorrection
                }
                else {
                    var transformStr = rotoFrame.css(transformProp);
                    if (transformStr === "none") return 0;

                    var matches = transformStr.match(/\-?[0-9]+/g),                    
                    val = (dimensions.coOrd === 'X') ? matches[4] : matches[5];
                    offset = parseInt(val);
                }
                return offset - options.startOffset;
            },
            
            // find the rotoKid nearest the given offset, and its position
            getNearestRotoKidTo = function(offset, dir) {
                var pos = 0, extent, bound,
                kids = (dir > 0) ? rotoKids.get().reverse() : rotoKids,
                kid, _el, measure = "outer" + dimensions.measure;
                $.each(kids, function(idx, el) {
                    _el = $(el);
                    // set pos to the position of the current rotoKid
                    pos = -1 * Math.round(_el.position()[dimensions.offsetName]);
                    kid = el;
                    // break the loop early if pos has overshot offset
                    if (pos * dir >= offset * dir) {
                        return false;
                    }
                    if (dir < 0) {
                        // if we're searching start-to-end, the extent is the current kid's width or height, plus pos; 
                        // the bound is the offset
                        extent = (-1 * pos) + _el[measure](true);
                        bound = -1 * offset;
                    }
                    else {
                        // if we're searching end-to-start, the extent is the previous kid's width or height, plus pos; 
                        // the bound is the offset
                        extent = _el.prev().length > 0 ? pos + _el.prev()[measure](true) : pos;
                        bound = offset;
                    }
                    // if the extent of the current kid has overshot the offset, break the loop
                    if (extent > bound) {
                        return false;
                    }
                });
                return [kid, pos];
            },
            
            // find the next (by direction) rotoKid to the given offset
            getNextRotoKidTo = function(offset, dir) {
                var func = dir < 0 ? "next" : "prev",
                curr = $(getNearestRotoKidTo(offset, dir)[0]),
                next = curr;
                // make sure we don't return a kid at the same offset (which can happen with stacked rotos)
                while (next[func]().length > 0 
                       && next.position()[dimensions.offsetName] === curr.position()[dimensions.offsetName]) {
                    next = next[func]();
                }
                return next;
            },
            
            // get the position of the rotoKid nearest the given offset
            getSnapMove = function(offset, dir, next) {
                var dir = (dir === 0) ? lastValidDir : dir
                return next ? 
                    -1 * Math.round(getNextRotoKidTo(offset, dir).position()[dimensions.offsetName])
                    : getNearestRotoKidTo(offset, dir)[1];
            },
            
            // is the roto already snapped to a rotoKid?
            isSnapped = function() {
                var offset = getCurrentOffset();
                return offset === getSnapMove(offset, lastValidDir, false);
            },
            
            
            
            /***                CHECKING MEASUREMENTS AND OFFSETS               ***/
            
            // remeasure the container and derive the minimum offset allowed
            // the minimum offset is the total measure of the rotoKids - the measure of the rotoFrame
            remeasure = function() {
                // measure the total width or height of the elements contained in the rotoFrame
                // if roto is horizontal, we have to individually measure each rotoKid
                rotoMeasure = 0;
                rotoKids = rotoFrame.children();
                rotoKids.css({ display: "block", "float": "left" });
                if (options.direction === 'h') {
                    // for each element, add the outer dimension of the element including margin and padding
                    rotoKids.each(function(idx, el) {
                        rotoMeasure += Math.round($(el)["outer"+dimensions.measure](true));
                    });
                    // set the dimension of the rotoFrame to what we measured, just to be sure
                    rotoFrame[dimensions.measure.toLowerCase()](rotoMeasure);
                }
                else {
                    // if roto is vertical we can use a simpler method to calculate size:
                    // just find the position of the last element and add its outer dimension, including margin and padding
                    var last = $(rotoKids.last());
                    rotoMeasure = Math.round(last.position()[dimensions.offsetName] + last["outer"+dimensions.measure](true));
                }
                containerMeasure = Math.round(container[dimensions.measure.toLowerCase()]()),
                minOffset = -1 * Math.round(
                    Math.max(0, rotoMeasure - containerMeasure)
                        + offsetCorrection 
                        + options.endOffset
                );
                if (options.snap) {
                    var offset = getSnapMove(minOffset, -1, false);
                    // check if the offset we got is less than the non-snap minOffset; if so, use the offset of the next rotoKid
                    minOffset = offset > minOffset ? getSnapMove(minOffset, -1, true) : offset;
                }
                if (options.auto_disable) setScrollingEnabled(minOffset !== maxOffset);
            },

            // set whether scrolling is enabled; if not, return to maxOffset and prevent drag events.
            setScrollingEnabled = function(enabled) {
                if (!enabled) {
                    gotoOffset(maxOffset);
                }
                scrollingEnabled = !!enabled;
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
                var offset = getCurrentOffset();

                // if the total measure of the rotoKids extends beyond the end of the rotoFrame, enable the next button
                if (offset > minOffset) {
                    nextButton.removeAttr("disabled");
                }
                else nextButton.attr("disabled", "disabled");

                // if the rotoKids are offset beyond the start of the rotoFrame, enable the previous button
                if (offset < maxOffset) {
                    prevButton.removeAttr("disabled");
                }
                else prevButton.attr("disabled", "disabled");
            },
            
            
            
            /***            TRIGGERING AND RESPONDING TO EVENTS                ***/
            
            // trigger event on completion of move
            notifyChanged = function() {
                container.trigger("rotoChange", [getNearestRotoKidTo(getCurrentOffset(), 1)[0]]);
                changeEventPrimed = false;
            },
            
            // respond to a goto event
            rotoGoto = function(data) {
                var type = typeof data, matches;
                switch(type) {
                case "number":
                    gotoNumber(data);
                    break;
                case "object":
                    gotoElement(data);
                    break;
                case "string":
                    if (matches = data.match(/(-?[0-9]+)(px$)/)) {
                        gotoOffset(parseInt(matches[1]));
                    }
                    else if (matches = data.match(/prev|next/)) {
                        gotoNext(data);
                    }
                    break;
                }
            },
            
            // goto a numbered element
            gotoNumber = function(num) {
                if (num < 0 || num >= rotoKids.length) return;
                var el = $(rotoKids.get(num));
                gotoElement(el);
            },
            
            // goto an element
            gotoElement = function(el) {
                var _el = $(el);
                if (!_el.parent() === rotoFrame) return;
                gotoOffset(-1 * _el.position()[dimensions.offsetName]);
            },
            
            // goto prev or next
            gotoNext = function(dirStr) {
                var dir = (dirStr === "prev") ? 1 : -1;
                gotoElement(getNextRotoKidTo(getCurrentOffset(), dir));
            },

            // goto an offset
            gotoOffset = function(offset, animation) {
                animation = animation || "shift";
                if (offset > maxOffset) offset = maxOffset;
                else if (offset < minOffset) offset = minOffset;
                offset += options.startOffset;
                doAnimation(rotoFrame, getAnimatedProp(offset), animation, function() {
                    switchButtons();
                    state = states.ready;
                });
            },
            
            
            
            /***                MOVING THE ROTOFRAME                ***/

            // shift the rotoKids one rotoFrame width in the given direction
            rotoShift = function(dir) {
                // do nothing if the animation is already running
                if (state === states.shifting) return;
                var move = 0;
                state = states.shifting;
                lastValidDir = dir;
                
                if (dir < 0) {
                    // if we're moving forwards, find the element nearest the end of the container
                    move = Math.max(
                        getSnapMove(getCurrentOffset() - (containerMeasure - options.startOffset), dir, false), 
                        minOffset
                    );
                }
                else {
                    // if we're moving backwards, find the element one container width towards the start of the container
                    move = Math.min(
                        getSnapMove(getCurrentOffset() + (containerMeasure - options.startOffset), dir, false), 
                        maxOffset
                    );
                }
                // move the offsetElement to the start of the container
                gotoOffset(move);
            },
            
            rotoStep = function(dir) {
                var dirStr = dir < 0 ? "next" : "prev";
                gotoNext(dirStr);
            },
            
            // track the rotoFrame to movement of the pointer
            rotoTrack = function(pointerMove) {
                var drag = Math.round(pointerMove + trackingOffset),
                move;
                // allow user to pull the rotoFrame beyond the max/min offsets
                if (drag < (maxOffset) && drag > (minOffset)) {
                    move = drag;
                }
                else {
                    var diff = (drag >= maxOffset) ? drag - maxOffset : drag - minOffset,
                    move = drag - diff/options.pull_divisor;
                }
                if (state !== states.tracking) {
                    var opt = {}, LUT = getTransitionLUT();
                    opt[LUT.durationProp] = "0s";
                    opt[LUT.timingFunctionProp] = "none";
                    rotoFrame.css(opt);
                }
                state = states.tracking;
                rotoFrame.css(getAnimatedProp(move));
            },
            
            // continue rotoFrame movement inertially based on pointer speed
            rotoDrift = function() {
                var speed_dir = timer.getPointerSpeed(),
                speed = speed_dir[0], dir = speed_dir[1],
                cOffset = getCurrentOffset(),
                distance = speed * options.drift_factor * dir, 
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
                gotoOffset(move, "drift");
            },
            
            // bounce the rotoFrame elastically after it's pulled beyond max or min offsets
            bounceBack = function(dir) {
                var end = (dir < 0) ? minOffset : maxOffset;
                state = states.bouncing;
                gotoOffset(end, "bounce");
            },
            
            // whether the buttons shift or step the roto
            buttonAction = options.btnAction === "shift" ? rotoShift : rotoStep,

            
            /***                STARTUP AND UTILITY FUNCTIONS               ***/
            
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
                if (options.setTestVars) setTestVars();
            };
            


            /***            STARTING UP THE ROTO                ***/

            // bind scroll events
            rotoFrame.bind(scrollEvents.start + ".roto-" + containerId, function(scrollStartEvent) {
                var stateNow = state;
                
                trackingOffset = getCurrentOffset();
                stopAnimation(rotoFrame);
                
                var linkElements = rotoFrame.find("a"),
                oldLinkEvents = {},
                coOrdStr = coOrdRef + dimensions.coOrd,
                eventsDetached = false;
                
                if (stateNow !== states.drifting) {
                    rotoFrame.undelegate(options.clickables, "click.roto-trackclick-" + containerId);
                }
                
                state = states.ready;

                if (!isTouchDevice) {
                    if (scrollStartEvent.target.draggable) {
                        scrollStartEvent.preventDefault(); // prevent drag behaviour
                    }
                    if (document.ondragstart !== undefined) {
                        // need to test this in IE before changing to delegate()
                        rotoFrame.find(options.clickables).one("dragstart.roto-" + containerId, function(dragStartEvent) { 
                            dragStartEvent.preventDefault(); 
                        });
                    }
                    if (linkElements.length > 0) {
                        $(document).one(scrollEvents.move + ".roto-" + containerId, function(moveStartEvent) {
                            if (linkElements.data("events") !== undefined) {
                                // gather any events attached to linkElements before unbinding
                                $.each(linkElements.data("events"), function(eventName, events) {
                                    oldLinkEvents[eventName] = [];
                                    $.each(events, function(i, event) {
                                        if (event.namespace !== "roto-" + containerId) {
                                            oldLinkEvents[eventName].push(event);
                                        }
                                    });
                                });
                                // prevent linkElements responding to other events during rotoFrame tracking
                                linkElements.unbind();
                                eventsDetached = true;
                            }
                            // prevent linkElements responding to clicks during rotoFrame tracking
                            rotoFrame.delegate(options.clickables, "click.roto-trackclick-" + containerId, function(linkTrackClickEvent) {
                                linkTrackClickEvent.preventDefault();
                            });
                        });
                    }
                }
                scrollStartEvent = wrapScrollEvent(scrollStartEvent);
                var startCoOrd = scrollStartEvent[coOrdStr];
                timer.setCurrentCoOrd(startCoOrd);

                // scrolling has started, so begin tracking pointer movement and measuring speed
                $(document).bind(scrollEvents.move + ".roto-" + containerId, function(trackEvent) {
                    if (!scrollingEnabled) return;
                    trackEvent.preventDefault();
                    trackEvent = wrapScrollEvent(trackEvent);
                    timer.setCurrentCoOrd(trackEvent[coOrdStr]);
                    rotoTrack(trackEvent[coOrdStr] - startCoOrd);
                });
                
                // user stopped scrolling
                $(document).bind(scrollEvents.end + ".roto-" + containerId, function() {
                    timer.stop();
                    var offset = getCurrentOffset();
                    if (offset > maxOffset || offset < minOffset) {
                        bounceBack(getCurrentOffset() - maxOffset);
                    }
                    else {
                        rotoDrift();
                    }
                    $(document).unbind(scrollEvents.move + ".roto-" + containerId);
                    window.setTimeout(function() {
                        if (eventsDetached) {
                            // reattach old events to linkElements after a short delay
                            $.each(oldLinkEvents, function(eventName, events) {
                                $.each(events, function(f, event) {
                                    var eventStr = event.type;
                                    if (event.namespace !== "") {
                                        eventStr = [eventStr, ".", event.namespace].join("");
                                    }
                                    linkElements.bind(eventStr, event.data, event.handler);
                                });
                            });
                        }
                    }, 250);
                    $(this).unbind();
                });
                timer.start();
            });

            // if prev/next buttons don't seem to be inside the container, look for them outside
            if (prevButton.length === 0 && options.btnPrev === defaults.btnPrev) {
                if (container.attr("id")) {
                    prevButton = $("#"+container.attr("id")+"-prev");
                    nextButton = $("#"+container.attr("id")+"-next");
                }
            }

            // bind button presses
            if (usingButtons()) {
                prevButton.click(function() {
                    return buttonAction(1);
                });
                nextButton.click(function() {
                    return buttonAction(-1);
                });
            }

            // remeasure everything on window resize, in case there are fluid elements involved
            $(window).resize(function() {
                boot();
            });

            // prevent webkit flicker    
            if (transitionProp === "-webkit-transition") rotoFrame.css("-webkit-backface-visibility", "hidden");

            // set required styles
            container.css({ display: "block", overflow: "hidden", position: "relative" });
            rotoFrame.css({ position: "relative", padding: 0, margin: 0 });

            // let's get started
            container.bind("rotoGoto", function(e, d) { rotoGoto(d); });
            container.bind("rotoShift", function(e, d) { rotoShift(d); });
            container.bind("rotoContentChange", function() { boot(); });
            container.bind("rotoDisable", function() { setScrollingEnabled(false); });
            container.bind("rotoEnable", function() { setScrollingEnabled(true); });
            boot();
            
            // move to startOffset
            if (options.startOffset !== 0) {
                rotoFrame.css(getAnimatedProp(options.startOffset));
                switchButtons();
            }

            // make IE7 sane
            offsetCorrection = Math.round(rotoFrame.position()[dimensions.offsetName]);
            if (offsetCorrection !== options.startOffset) remeasure();
        });
    }
})(jQuery, window, document);

