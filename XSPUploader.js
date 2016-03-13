/**
 * xpageFileUploader
 *	adapted from
 * jquery.plupload.queue.js (Copyright 2009, Moxiecode Systems AB, Released under GPL License)

<<
Copyright 2010 Mark Leusink
Licensed under the Apache License, Version 2.0 (the "License"); you may not use this 
file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF 
ANY KIND, either express or implied. See the License for the specific language governing
permissions and limitations under the License
>> 
*/
dojo.declare("XPageUploader", null, {

    debugMode: null, //output debug messages to the (firebug) console
    uploadToDocumentUNID: null,
    authKey: null,
    dbPath: "#{javascript: datasource['DB_FILEPATH']}",

    isError: false,
    errorMsg: "",

    uploader: null,
    container: null,
    thumbnailContainer: null,
    id: null,
    runtime: null,

    xpageUploadA: "aUploadA.xsp", //name of the xpage that processes uploaded files for Anonymous users
    xpageUpload: "aUpload.xsp", //name of the xpage that processess uploaded files for Authenticated users

    constructor: function(settings, debugMode) {
        this.id = "uploader";
        this.debugMode = debugMode || false;
        this.container = dojo.byId(this.id);
        settings.url = this.xpageUpload; //default		
        this.uploader = new plupload.Uploader(settings);
        this.uploader.bind("UploadFile", function(up, file) {
            $('#' + file.id).addClass('plupload_current_file');
        });

        this.uploader.bind('Init', dojo.hitch(this, function(up, params) {
            this.runtime = params.runtime;
            this.render();

            // Enable drag/drop
            if (up.features.dragdrop && up.settings.dragdrop) {
                up.settings.drop_element = this.id + '_filelist';
                $('#' + this.id + '_filelist').append('<li class="plupload_droptext">' + this._("Drag images to be uploaded here.") + '</li>');
            }

            //start upload button					
            var btnUpload = dojo.byId(this.uploader.settings.start_button);
            dojo.connect(btnUpload, "onclick", this.uploader, function(e) {
                this.start();
                dojo.stopEvent(e);
            });

        }));

        this.uploader.init();



        this.uploader.bind('StateChanged', dojo.hitch(this, function() {

            $('#' + this.uploader.settings.start_button).attr("disabled", this.uploader.state === plupload.STARTED);
            $('#' + this.uploader.settings.browse_button).attr("disabled", this.uploader.state === plupload.STARTED);

            if (this.uploader.state === plupload.STARTED) {
                $('li.plupload_delete a', this.container).hide();
                $('span.plupload_upload_status,div.plupload_progress,a.plupload_stop', this.container).css('display', 'block');
                $('span.plupload_upload_status', this.container).text('Uploaded 0/' + this.uploader.files.length + ' files');
            } else {
                $('a.plupload_stop,div.plupload_progress', this.container).hide();
                $('a.plupload_delete', this.container).css('display', 'block');
            }
        }));

        this.uploader.bind('StateChanged', dojo.hitch(this, function(up) {
            if (up.state == plupload.STOPPED) {
                this.updateList();
            }

        }));

        this.uploader.bind('FileUploaded', dojo.hitch(this, function(up, file, res) {
            this.handleStatus(file, res);
        }));

        this.uploader.bind("UploadProgress", dojo.hitch(this, function(up, file) {
            // Set file specific progress
            $('#' + file.id + ' div.plupload_file_status', this.container).html(file.percent + '%');

            this.handleStatus(file);
            this.updateTotalProgress();
        }));

        this.uploader.bind("BeforeUpload", dojo.hitch(this, function(up, file) {
            this.debug("before: " + file.name + up.settings.url);

            if (this.runtime == "flash") {
                this.debug("using flash runtime - get authorization key");

                this.getAuthKey(file.name);

                if (this.isError) {
                    alert("Upload error: " + this.errorMsg);
                    up.stop();
                }

                up.settings.url = this.getUploadURL();
                this.debug("URL: " + up.settings.url);
            }

        }));

        this.uploader.bind("Error", dojo.hitch(this, function(up, err) {
            var file = err.file,
                message;

            if (file) {
                message = err.message;

                if (err.details) {
                    message += " (" + err.details + ")";
                }

                if (err.code == plupload.FILE_SIZE_ERROR) {
                    alert(this._("Error: File to large: ") + file.name);
                }

                if (err.code == plupload.FILE_EXTENSION_ERROR) {
                    alert(this._("Error: Invalid file extension: ") + file.name + "\n\n(" + this._("supported extensions: ") + up.settings.supported_file_types + ")");
                }

                $('#' + file.id).attr('class', 'plupload_failed').find('a').css('display', 'block').attr('title', message);
            }
        }));

        this.uploader.bind('QueueChanged', dojo.hitch(this, "updateList"));

    },

    render: function() {
        //remove 'unsupported' message
        dojo.forEach(dojo.query("> p", this.container), function(node) {
            dojo.destroy(node);
        });

        var wrapper = dojo.create("div", {
            innerHTML: '<div id="' + this.id + '_container" class="plupload_container">' +
                '<div class="plupload">' +
                '<div class="plupload_content">' +
                '<div class="plupload_filelist_header">' +
                '<div class="plupload_file_name">' + this._('Filename') + '</div>' +
                '<div class="plupload_file_action">&nbsp;</div>' +
                '<div class="plupload_file_status"><span>' + this._('Status') + '</span></div>' +
                '<div class="plupload_file_size">' + this._('Size') + '</div>' +
                '<div class="plupload_clearer">&nbsp;</div>' +
                '</div>' +

                '<ul id="' + this.id + '_filelist" class="plupload_filelist"></ul>' +

                '<div class="plupload_filelist_footer">' +
                '<div class="plupload_file_name">' +
                '<span class="plupload_upload_status"></span>' +
                '</div>' +
                '<div class="plupload_file_action"></div>' +
                '<div class="plupload_file_status"><span class="plupload_total_status">0%</span></div>' +
                '<div class="plupload_file_size"><span class="plupload_total_file_size">0 b</span></div>' +
                '<div class="plupload_progress">' +
                '<div class="plupload_progress_container">' +
                '<div class="plupload_progress_bar"></div>' +
                '</div>' +
                '</div>' +
                '<div class="plupload_clearer">&nbsp;</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<input type="hidden" id="' + this.id + '_count" name="' + this.id + '_count" value="0" />'
        });

        dojo.addClass(wrapper, "plupload_wrapper plupload_scroll");
        dojo.place(wrapper, this.container, "first");

    },

    updateList: function() {
        var fileList = dojo.query('ul.plupload_filelist', this.container)[0];
        dojo.empty(fileList);

        fileList = $('ul.plupload_filelist', this.container).html('');
        var inputCount = 0
        var inputHTML;

        dojo.forEach(this.uploader.files, function(file, i) {
            inputHTML = '';

            if (file.status == plupload.DONE) {
                if (file.target_name) {
                    inputHTML += '<input type="hidden" name="' + this.id + '_' + inputCount + '_tmpname" value="' + plupload.xmlEncode(file.target_name) + '" />';
                }

                inputHTML += '<input type="hidden" name="' + this.id + '_' + inputCount + '_name" value="' + plupload.xmlEncode(file.name) + '" />';
                inputHTML += '<input type="hidden" name="' + this.id + '_' + inputCount + '_status" value="' + (file.status == plupload.DONE ? 'done' : 'failed') + '" />';

                inputCount++;

                $('#' + this.id + '_count').val(inputCount);
            }

            fileList.append(
                '<li id="' + file.id + '">' +
                '<div class="plupload_file_name"><span>' + file.name + '</span></div>' +
                '<div class="plupload_file_action"><a href="#"></a></div>' +
                '<div class="plupload_file_status">' + file.percent + '%</div>' +
                '<div class="plupload_file_size">' + plupload.formatSize(file.size) + '</div>' +
                '<div class="plupload_clearer">&nbsp;</div>' +
                inputHTML +
                '</li>'
            );

            this.handleStatus(file);

            if (file.status == plupload.QUEUED) {

                //onclick to remove files
                dojo.connect(dojo.query('#' + file.id + '.plupload_delete a')[0], "onclick", this, function(e) {
                    $('#' + file.id).remove();
                    this.uploader.removeFile(file);
                    e.preventDefault();
                });

                //rename support
                if (!this.uploader.settings.unique_names && this.uploader.settings.rename) {

                    dojo.connect(dojo.query('#' + file.id + ' div.plupload_file_name span', this.container)[0], "onclick", this, function(e) {
                        var targetSpan = $(e.target);
                        var file, parts, name, ext = "";

                        // Get file name and split out name and extension
                        file = this.uploader.getFile(targetSpan.parents('li')[0].id);
                        name = file.name;
                        parts = /^(.+)(\.[^.]+)$/.exec(name);
                        if (parts) {
                            name = parts[1];
                            ext = parts[2];
                        }

                        // Display input element
                        targetSpan.hide().after('<input type="text" />');
                        targetSpan.next().val(name).focus().blur(function() {
                            targetSpan.show().next().remove();
                        }).keydown(function(e) {
                            var targetInput = $(this);

                            if (e.keyCode == 13) {
                                e.preventDefault();

                                // Rename file and glue extension back on
                                file.name = targetInput.val() + ext;
                                targetSpan.text(file.name);
                                targetInput.blur();
                            }
                        });
                    });
                }

            }
        }, this);

        dojo.html.set(dojo.query('span.plupload_total_file_size', this.container)[0], plupload.formatSize(this.uploader.total.size));

        if (this.uploader.total.queued === 0) {
            $('span.plupload_add_text', this.container).text(this._('Add files.'));
        } else {
            $('span.plupload_add_text', this.container).text(this.uploader.total.queued + ' files queued.');
        }

        //enable/disable start button		
        $('#' + this.uploader.settings.start_button).attr("disabled", (this.uploader.files.length === 0));
        $('#' + this.uploader.settings.start_button).attr("disabled", false);
        // Scroll to end of file list
        fileList[0].scrollTop = fileList[0].scrollHeight;

        this.updateTotalProgress();

        // Re-add drag message if there is no files
        if (!this.uploader.files.length && this.uploader.features.dragdrop && this.uploader.settings.dragdrop) {
            $('#' + this.id + '_filelist').append('<li class="plupload_droptext">' + this._("Drag images here.") + '</li>');
        }
    },

    handleStatus: function(file, res) {
        var actionClass;

        if (file.status == plupload.DONE) {

            actionClass = 'plupload_done';

            if (typeof res != "undefined") {
                var r = dojo.fromJson(res.response);
                this.showThumbnail(r.thumbnailURL);
            }
        }

        if (file.status == plupload.FAILED) {
            actionClass = 'plupload_failed';
        }

        if (file.status == plupload.QUEUED) {
            actionClass = 'plupload_delete';
        }

        if (file.status == plupload.UPLOADING) {
            actionClass = 'plupload_uploading';
        }

        $('#' + file.id).attr('class', actionClass).find('a').css('display', 'block');
    },

    updateTotalProgress: function() {
        $('span.plupload_total_status', this.container).html(this.uploader.total.percent + '%');
        $('div.plupload_progress_bar', this.container).css('width', this.uploader.total.percent + '%');
        $('span.plupload_upload_status', this.container).text('Uploaded ' + this.uploader.total.uploaded + '/' + this.uploader.files.length + ' files');

        // All files are uploaded
        if (this.uploader.total.uploaded == this.uploader.files.length) {
            this.uploader.stop();
        }
    },

    //translate a string
    _: function(str) {
        return plupload.translate(str) || str;
    },

    showThumbnail: function(url) {
        if (this.thumbnailContainer == null) {
            var objThumbnails = dojo.byId("thumbnails");
            this.thumbnailContainer = dojo.query(".content", objThumbnails)[0]
        }

        var img = dojo.create("img", {
            src: url
        }, this.thumbnailContainer);

        dojo.connect(img, "onload", dojo.hitch(this, function() {
            //scroll to end of list 
            this.thumbnailContainer.scrollTop = this.thumbnailContainer.scrollHeight;
        }));
    },

    debug: function(message) {
        if (this.debugMode) {
            console.log(message);
        }
    },

    getAuthKeySuccess: function(data) {

        //check for errors in the agent output
        if (data.isError) {
            this.getAuthKeyError(data);
            return false;
        }

        this.uploadToDocumentUNID = data.targetUnid;
        this.debug("target document unid: " + this.uploadToDocumentUNID);
        this.authKey = data.authKey;
        this.debug("auth key: " + this.authKey);
    },

    getAuthKeyError: function(data) {
        this.debug("error while retrieving auth key ");
        this.isError = true;
        this.errorMsg = data.errorMsg;
    },

    //create a authorization key to verify the user's authorization
    //create an upload document to post the files to
    getAuthKey: function(fileName) {

        this.debug("verify authorization...");

        var pm = [];
        pm.push("fileName=" + encodeURIComponent(fileName));

        var getAuthKeyURL = this.dbPath + "/aGetAuthKey.xsp?" + pm.join("&");

        var xhrArgs = {
            url: getAuthKeyURL,
            load: dojo.hitch(this, "getAuthKeySuccess"),
            error: dojo.hitch(this, "getAuthKeyError"),
            sync: true, //wait until verification is complete
            preventCache: true,
            handleAs: "json"
        };
        var deferred = dojo.xhrGet(xhrArgs);
    },

    getUploadURL: function() {
        return this.dbPath + "/" + this.xpageUploadA +
            "?authKey=" + this.authKey +
            "&id=" + this.uploadToDocumentUNID
    }

});
