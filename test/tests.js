$(window).load(function(){

    var obj = {},
    
        offsetNames = { "v": "top", "h": "left" },
        
        dimensions = { "v": "Height", "h": "Width" },
        
        clickPrevButton = function(cont) {
            cont.data("prevButton").click();
        },
        clickNextButton = function(cont) {
            cont.data("nextButton").click();
        },
        
        setup = function() {
            $.each([$("#carousel"), $("#slideshow"), $("#listbox"), $("#vertical-multi")], function(idx, el) {
                obj[el.attr("id")] = { 
                    "cont": el, 
                    "testFrame": el.children(".testFrame"), 
                    "kids": el.children(".testFrame").children(),
                    "startPos": el.children(".testFrame").position() 
                };
            });

            obj["carousel"].cont.roto({ snap: false, setTestVars: true, startOffset: 300 });
            obj["slideshow"].cont.roto({ setTestVars: true });
            obj["listbox"].cont.roto({ direction: "v", setTestVars: true });
            obj["vertical-multi"].cont.roto({ direction: "v", setTestVars: true });
        };

});
